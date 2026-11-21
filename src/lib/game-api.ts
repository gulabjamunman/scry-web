/**
 * src/lib/game-api.ts
 *
 * API layer for all game data writes and reads.
 *
 * Architecture:
 *   - The game HTML posts events to VasantpurPage.tsx via postMessage
 *   - VasantpurPage catches them and calls functions here
 *   - All Supabase writes happen in React — never in the iframe
 *
 * Tables written to:
 *   game_sessions    — one row per player per day, updated incrementally
 *   game_answers     — one row per decision, inserted immediately on commit
 *   reader_profiles  — upserted after session completes
 *
 * game_community_stats is a VIEW — it updates automatically, we only read it.
 */

import { supabase } from '@/lib/supabase'
import { incrementPlayCount, getAnonId } from '@/lib/reader-identity'
import type {
  GameAnswerRow,
  VasantpurSessionPayload,
  Persona,
  BehavioralDim,
  RoundType,
} from '@/lib/vasantpur-types'

// ── Framing helpers ───────────────────────────────────────────────────────────

const OPINION_FR_MAP: Record<number, number> = {
  0:  0.4,   // cautiously hopeful — absorbs development framing
  1: -0.2,   // uneasy — questioning
  2:  0.0,   // unsure — neutral
  3:  0.2,   // Rajan-influenced — peer-framed
}

const UPDATE_FR_MAP: Record<number, number> = {
  0: -0.1,   // held both — partial update
  1:  0.3,   // defaulted to established outlet — prior held
  2:  0.0,   // stayed uncertain — no update
  3: -0.1,   // reflected back — deflected
}

const DIM_MAP: Record<RoundType, BehavioralDim> = {
  source_selection:    'trust_hierarchy',
  opinion_formation:   'framing_absorption',
  bayesian_update:     'prior_update',
  silence_registration:'absence_detection',
  wire_annotation:     'source_attribution',
  synthesis_edit:      'synthesis_under_pressure',
  vote:                'collective_action',
  research_allocation: 'resource_allocation',
  divergence_detection:'divergence_detection',
  hypothesis_formation:'hypothesis_formation',
  confound_recognition:'confound_recognition',
}

function framingLabel(fr: number | null): string | null {
  if (fr === null) return null
  if (fr < -0.2) return 'left'
  if (fr >  0.2) return 'right'
  return 'neutral'
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── Session creation ──────────────────────────────────────────────────────────

export interface CreateSessionParams {
  clusterId: string | null
  scenarioId: string | null
  clusterTopic: string | null
  persona: Persona
  platform: 'web' | 'mobile'
}

/**
 * Create the game_sessions row at game start.
 * Returns the session UUID to be used in all subsequent writes.
 */
export async function createGameSession(
  params: CreateSessionParams
): Promise<string | null> {
  const anonId = getAnonId()
  const { data: { user } } = await supabase.auth.getUser()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      anon_id:      anonId,
      user_id:      user?.id ?? null,
      session_date: today,
      cluster_id:   params.clusterId,
      cluster_topic: params.clusterTopic,
      scenario_id:  params.scenarioId,
      persona:      params.persona,
      answers:      {},
      scores:       {},
      total_score:  0,
      round_timings_ms: {},
      answer_changes:   {},
      reveals_engaged:  {},
      platform:     params.platform,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[game-api] createGameSession failed:', error.message)
    return null
  }

  return data?.id ?? null
}

// ── Per-decision logging ──────────────────────────────────────────────────────

/**
 * Insert one row into game_answers immediately when the player commits.
 * This is the core training data write — called on every decision.
 */
export async function logDecision(row: GameAnswerRow): Promise<void> {
  const { error } = await supabase
    .from('game_answers')
    .insert(row)

  if (error) {
    console.error('[game-api] logDecision failed:', error.message, row.round_type)
  }
}

// ── Session patch ─────────────────────────────────────────────────────────────

/**
 * Incrementally update the session row as the player moves through beats.
 * Called after each beat completes — fire and forget.
 */
export async function patchGameSession(
  sessionId: string,
  updates: Partial<{
    answers: Record<string, unknown>
    scores: Record<string, number>
    total_score: number
    round_timings_ms: Record<string, number>
    answer_changes: Record<string, number>
    reveals_engaged: Record<string, boolean>
    completed_at: string
  }>
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update(updates)
    .eq('id', sessionId)

  if (error) {
    console.error('[game-api] patchGameSession failed:', error.message)
  }
}

// ── Session completion ────────────────────────────────────────────────────────

/**
 * Called when the player completes Beat 5.
 * Finalises the session, updates the reader profile, increments play count.
 */
export async function completeGameSession(
  sessionId: string,
  payload: VasantpurSessionPayload
): Promise<void> {
  const anonId = getAnonId()

  // 1. Finalise session row
  await patchGameSession(sessionId, {
    answers:          payload.answers as Record<string, unknown>,
    scores:           payload.scores,
    total_score:      payload.totalScore,
    round_timings_ms: payload.roundTimingsMs,
    answer_changes:   payload.answerChanges,
    reveals_engaged:  payload.revealsEngaged,
    completed_at:     payload.completedAt,
  })

  // 2. Update reader profile
  await updateReaderProfile(anonId, payload)

  // 3. Increment local play count
  incrementPlayCount()
}

// ── Reader profile update ─────────────────────────────────────────────────────

async function updateReaderProfile(
  anonId: string,
  payload: VasantpurSessionPayload
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch existing profile
  const { data: existing, error: fetchError } = await supabase
    .from('reader_profiles')
    .select('*')
    .eq('anon_id', anonId)
    .maybeSingle()

  if (fetchError) {
    console.error('[game-api] profile fetch failed:', fetchError.message)
    return
  }

  const n     = (existing?.sessions_count ?? 0) + 1
  const alpha = 1 / n

  // ── Accuracy signals from this session ────────────────────────────────
  const framingAcc  = payload.scores.b2 ?? 0   // bayesian update correct
  const silenceAcc  = payload.scores.b3 ?? 0   // noticed silence
  const outlierAcc  = (payload.answers.b4_anno === 'lazy') ? 1 : 0
  const verdictAlign = [0,1,2].includes(payload.answers.b5_vote as number) ? 1 : 0

  // ── Framing bias ──────────────────────────────────────────────────────
  const b1Opinion  = payload.answers.b1_opinion as number ?? 2
  const impliedFr  = OPINION_FR_MAP[b1Opinion] ?? 0
  const biasDelta  = payload.firstSrcFr !== null
    ? impliedFr - payload.firstSrcFr
    : 0

  // ── Trust distribution ────────────────────────────────────────────────
  const trustDist: Record<string, number> = { ...(existing?.trust_distribution ?? {}) }
  const outletKey = (payload.answers._src_outlet_type as string) ?? 'unknown'
  trustDist[outletKey] = (trustDist[outletKey] ?? 0) + 1

  // ── Per-topic framing accuracy ─────────────────────────────────────────
  const topicScores: Record<string, number> = { ...(existing?.topic_scores ?? {}) }
  if (payload.clusterTopic) {
    const prev = topicScores[payload.clusterTopic] ?? 0
    topicScores[payload.clusterTopic] = lerp(prev, framingAcc, alpha)
  }

  // ── Update threshold ───────────────────────────────────────────────────
  const didUpdate =
    payload.answers.b2_update === 0 || payload.answers.b2_update === 2
  let updateThreshold: number | null = existing?.update_threshold ?? null
  if (didUpdate && payload.b2Delta !== null) {
    updateThreshold = updateThreshold !== null
      ? lerp(updateThreshold, payload.b2Delta, alpha)
      : payload.b2Delta
  }

  // ── Reader type (derived after 5+ sessions) ───────────────────────────
  let readerType: string | null        = existing?.reader_type ?? null
  let readerTypeReason: string | null  = existing?.reader_type_reason ?? null
  if (n >= 5) {
    const ta = existing?.framing_accuracy ?? 0
    const sa = existing?.silence_accuracy ?? 0
    const oa = existing?.outlier_accuracy ?? 0
    const fb = existing?.framing_bias ?? 0
    if (sa > 0.6)      { readerType = 'silence_spotter';   readerTypeReason = 'You consistently notice what coverage leaves out before engaging with what it includes.' }
    else if (oa > 0.6) { readerType = 'pattern_reader';    readerTypeReason = 'You catch structural patterns — wire reprints, convergent framing — that most readers miss entirely.' }
    else if (ta > 0.6) { readerType = 'framing_literate';  readerTypeReason = 'You read framing direction accurately across topics and outlet types.' }
    else if (fb > 0.3) { readerType = 'confirmed_reader';  readerTypeReason = 'Your first source shapes your final read more than subsequent ones.' }
    else               { readerType = 'developing';         readerTypeReason = 'Your reading patterns are still forming. Keep playing — the picture sharpens.' }
  }

  // ── Streak ────────────────────────────────────────────────────────────
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const streak    = existing?.last_played === yesterday
    ? (existing?.streak_days ?? 0) + 1
    : 1

  const { error: upsertError } = await supabase
    .from('reader_profiles')
    .upsert({
      anon_id:           anonId,
      user_id:           user?.id ?? existing?.user_id ?? null,
      framing_accuracy:  lerp(existing?.framing_accuracy  ?? 0, framingAcc,   alpha),
      silence_accuracy:  lerp(existing?.silence_accuracy  ?? 0, silenceAcc,   alpha),
      outlier_accuracy:  lerp(existing?.outlier_accuracy  ?? 0, outlierAcc,   alpha),
      verdict_alignment: lerp(existing?.verdict_alignment ?? 0, verdictAlign, alpha),
      framing_bias:      lerp(existing?.framing_bias      ?? 0, biasDelta,    alpha),
      topic_scores:      topicScores,
      trust_distribution: trustDist,
      update_threshold:  updateThreshold,
      sessions_count:    n,
      avg_score:         lerp(existing?.avg_score ?? 0, payload.totalScore, alpha),
      best_score:        Math.max(existing?.best_score ?? 0, payload.totalScore),
      streak_days:       streak,
      last_played:       today,
      reader_type:       readerType,
      reader_type_reason: readerTypeReason,
      dominant_persona:  payload.persona,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'anon_id' })

  if (upsertError) {
    console.error('[game-api] profile upsert failed:', upsertError.message)
  }
}

// ── Community stats ───────────────────────────────────────────────────────────

export interface CommunityStats {
  total: number
  avgScore: number
  pctHighScore: number
  gapDistribution: Record<string, number>
  trustDistribution: Record<string, number>
}

/**
 * Read today's community stats from the game_community_stats VIEW.
 * The view auto-aggregates from game_sessions — we never write to it.
 */
export async function getTodaysCommunityStats(
  clusterId: string
): Promise<CommunityStats | null> {
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('game_community_stats')
    .select('total_sessions, avg_score, max_score, pct_high_score, verdict_gap_dist, verdict_trust_dist')
    .eq('cluster_id', clusterId)
    .eq('session_date', today)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[game-api] community stats failed:', error.message)
    return null
  }

  return {
    total:             Number(data.total_sessions ?? 0),
    avgScore:          Number(data.avg_score ?? 0),
    pctHighScore:      Number(data.pct_high_score ?? 0),
    gapDistribution:   (data.verdict_gap_dist  as Record<string, number>) ?? {},
    trustDistribution: (data.verdict_trust_dist as Record<string, number>) ?? {},
  }
}

// ── Play today check ──────────────────────────────────────────────────────────

export async function hasPlayedToday(): Promise<boolean> {
  const anonId = getAnonId()
  const { data: { user } } = await supabase.auth.getUser()
  const today = new Date().toISOString().split('T')[0]

  let query = supabase
    .from('game_sessions')
    .select('id', { count: 'exact' })
    .eq('session_date', today)

  query = user?.id
    ? query.eq('user_id', user.id)
    : query.eq('anon_id', anonId)

  const { count, error } = await query
  if (error) {
    console.error('[game-api] hasPlayedToday failed:', error.message)
    return false
  }

  return (count ?? 0) > 0
}

// ── Reader profile reads ──────────────────────────────────────────────────────

export async function getReaderProfile() {
  const anonId = getAnonId()
  const { data: { user } } = await supabase.auth.getUser()

  const query = user?.id
    ? supabase.from('reader_profiles').select('*').eq('user_id', user.id)
    : supabase.from('reader_profiles').select('*').eq('anon_id', anonId)

  const { data, error } = await query.maybeSingle()
  if (error) {
    console.error('[game-api] getReaderProfile failed:', error.message)
    return null
  }
  return data
}

export async function getReaderProfileByAnonId(anonId: string) {
  const { data, error } = await supabase
    .from('reader_profiles')
    .select('*')
    .eq('anon_id', anonId)
    .maybeSingle()

  if (error) {
    console.error('[game-api] getReaderProfileByAnonId failed:', error.message)
    return null
  }
  return data
}

// ── Helper: build a GameAnswerRow from raw game state ─────────────────────────
// Call this from VasantpurPage when handling vasantpur:decision messages.

export function buildAnswerRow(
  sessionId: string,
  anonId: string,
  userId: string | null,
  clusterId: string | null,
  scenarioId: string | null,
  clusterTopic: string | null,
  persona: Persona,
  roundType: RoundType,
  roundIndex: number,
  choiceIndex: number,
  params: {
    shownFramingValues?: unknown[]
    srcFr?: number | null
    src1Fr?: number | null
    src2Fr?: number | null
    annoLabel?: string
    articleIds?: string[]
    allOptions?: unknown[]
    editsCount?: number
    finalFr?: number | null
    timingMs?: number
    changedAnswer?: boolean
    numChanges?: number
    silentPublishers?: string[]
    outletType?: string
    voteLabel?: string
  }
): GameAnswerRow {
  const behavioralDim = DIM_MAP[roundType]
  const row: GameAnswerRow = {
    session_id:     sessionId,
    user_id:        userId,
    anon_id:        anonId,
    cluster_id:     clusterId,
    scenario_id:    scenarioId,
    topic:          clusterTopic,
    persona,
    behavioral_dim: behavioralDim,
    round_index:    roundIndex,
    round_type:     roundType,
    time_taken_ms:  params.timingMs ?? null,
    changed_answer: params.changedAnswer ?? false,
    num_changes:    params.numChanges ?? 0,
    answer:         { choice_index: choiceIndex },
  }

  // Per-type enrichment
  switch (roundType) {
    case 'source_selection': {
      row.shown_framing_values = params.shownFramingValues ?? null
      row.answer               = { choice_index: choiceIndex, outlet_type: params.outletType, fr: params.srcFr }
      row.actual_framing_score = params.srcFr ?? null
      row.framing_estimate     = framingLabel(params.srcFr ?? null)
      break
    }
    case 'opinion_formation': {
      const impliedFr  = OPINION_FR_MAP[choiceIndex] ?? 0
      const srcFr      = params.srcFr ?? null
      row.answer               = { choice_index: choiceIndex, implied_fr: impliedFr }
      row.actual_framing_score = srcFr
      row.framing_estimate     = framingLabel(impliedFr)
      row.framing_error        = srcFr !== null ? Math.abs(impliedFr - srcFr) : null
      break
    }
    case 'bayesian_update': {
      const delta = (params.src1Fr !== null && params.src2Fr !== null)
        ? Math.abs((params.src2Fr ?? 0) - (params.src1Fr ?? 0))
        : null
      const impliedFr  = UPDATE_FR_MAP[choiceIndex] ?? 0
      const didUpdate  = choiceIndex === 0 || choiceIndex === 2
      row.shown_framing_values = [{ src1_fr: params.src1Fr, src2_fr: params.src2Fr, delta }]
      row.answer               = {
        choice_index: choiceIndex,
        update_type: ['held_both','defaulted','uncertain','reflected'][choiceIndex],
      }
      row.actual_framing_score = params.src2Fr ?? null
      row.framing_estimate     = framingLabel(impliedFr)
      row.framing_error        = delta  // repurposed as update_delta
      row.is_correct           = didUpdate
      break
    }
    case 'silence_registration': {
      const noticed = choiceIndex === 0 || choiceIndex === 2
      const acted   = choiceIndex === 2
      row.shown_framing_values = params.silentPublishers ?? null
      row.answer               = { choice_index: choiceIndex, noticed, acted }
      row.is_correct           = noticed
      row.intensity_estimate   = noticed ? (acted ? 'high' : 'medium') : 'low'
      break
    }
    case 'wire_annotation': {
      row.article_ids          = params.articleIds ?? null
      row.shown_framing_values = params.allOptions ?? null
      row.answer               = { label: params.annoLabel }
      row.framing_estimate     = params.annoLabel ?? null
      break
    }
    case 'synthesis_edit': {
      const finalFr    = params.finalFr ?? null
      const srcFr      = params.srcFr ?? null
      row.answer               = { edits_count: params.editsCount ?? 0 }
      row.actual_framing_score = finalFr
      row.framing_error        = (finalFr !== null && srcFr !== null)
        ? Math.abs(finalFr - srcFr)
        : null
      row.num_changes          = params.editsCount ?? 0
      break
    }
    case 'vote': {
      const labels = ['independent_review', 'conditional', 'approve']
      row.answer             = { choice_index: choiceIndex, label: labels[choiceIndex] }
      row.intensity_estimate = labels[choiceIndex]
      break
    }
  }

  return row
}
