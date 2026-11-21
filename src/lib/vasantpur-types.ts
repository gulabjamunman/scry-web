// ─────────────────────────────────────────────────────────────────────────────
// Vasantpur · Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// ── Scenario content types ────────────────────────────────────────────────────

export interface VasantpurSource {
  id: string
  fr: number
  lbl: string
  col: string
  pub: string
  hl: string
  body: string
  thread: string
  effect: string
  source_url?: string | null
}

export interface VasantpurCharacter {
  name: string
  age?: number
  role: string
  persona_type: 'regular_reader' | 'journalist' | 'researcher'
  bio: string
  personal_stake: string
  goal: string
  conflict: string
  unsent_message?: string
}

export interface VasantpurSupportingCastMember {
  name: string
  role: string
  bio: string
  reading_pattern: string
  tension: string
}

export interface VasantpurHumanScaleLocation {
  name: string
  description: string
  connection_to_character: string
}

export interface VasantpurScry {
  publishers: string[]
  silent: string[]
  fr: number
  intensity: number
  fact: number
  insight: string
  missing: string
  cluster_id?: string
  topic?: string
}

export interface VasantpurPayload {
  title: string
  character?: VasantpurCharacter | Record<string, unknown>
  supporting_cast?: VasantpurSupportingCastMember[] | Array<Record<string, unknown>>
  human_scale_location?: VasantpurHumanScaleLocation | Record<string, unknown>
  srcs: VasantpurSource[]
  scry: VasantpurScry
  anno: Array<{ id: string; main: string; sub: string }>
  anno_results: Record<string, number>
  wire_sentence: string
}

// Raw shape coming from the generator (field names differ slightly)
export interface GeneratedScenarioPayload {
  location_name?: string
  event_summary?: string
  character?: VasantpurCharacter | Record<string, unknown>
  supporting_cast?: VasantpurSupportingCastMember[] | Array<Record<string, unknown>>
  human_scale_location?: VasantpurHumanScaleLocation | Record<string, unknown>
  sources?: VasantpurSource[]   // generator uses "sources"
  srcs?: VasantpurSource[]      // normalised form uses "srcs"
  scry?: VasantpurScry
  anno?: VasantpurPayload['anno']
  anno_results?: VasantpurPayload['anno_results']
  wire_sentence?: string
}

export interface GameScenarioRow {
  id: string
  slug: string
  scenario_date: string
  title: string
  story_cluster_id: string | null
  payload: GeneratedScenarioPayload | VasantpurPayload
  model: string | null
  prompt_version: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Behavioral logging types ───────────────────────────────────────────────────
// These map exactly to the game_answers and game_sessions columns.

export type Persona = 'meera' | 'arjun' | 'ananya'

export type BehavioralDim =
  // Meera (regular reader)
  | 'trust_hierarchy'
  | 'framing_absorption'
  | 'prior_update'
  | 'absence_detection'
  | 'source_attribution'
  | 'synthesis_under_pressure'
  | 'collective_action'
  // Arjun (journalist) — future
  | 'resource_allocation'
  | 'divergence_detection'
  // Ananya (researcher) — future
  | 'hypothesis_formation'
  | 'confound_recognition'

export type RoundType =
  | 'source_selection'
  | 'opinion_formation'
  | 'bayesian_update'
  | 'silence_registration'
  | 'wire_annotation'
  | 'synthesis_edit'
  | 'vote'
  // Future personas
  | 'research_allocation'
  | 'divergence_detection'
  | 'hypothesis_formation'
  | 'confound_recognition'

// One row per decision in game_answers
export interface GameAnswerRow {
  session_id: string
  user_id: string | null
  anon_id: string
  cluster_id: string | null
  scenario_id: string | null
  topic: string | null
  persona: Persona
  behavioral_dim: BehavioralDim
  round_index: number
  round_type: RoundType
  article_ids?: unknown[] | null
  shown_framing_values?: unknown[] | null
  answer: Record<string, unknown>
  correct_answer?: Record<string, unknown> | null
  is_correct?: boolean | null
  score?: number | null
  time_taken_ms?: number | null
  changed_answer?: boolean
  num_changes?: number
  framing_estimate?: string | null
  actual_framing_score?: number | null
  framing_error?: number | null
  intensity_estimate?: string | null
  actual_intensity?: number | null
  intensity_error?: number | null
}

// Full session payload sent from the game to the React layer via postMessage
export interface VasantpurSessionPayload {
  // Session-level fields
  clusterId: string | null
  scenarioId: string | null
  clusterTopic: string | null
  persona: Persona
  answers: Record<string, unknown>        // keyed by beat: b1_src, b2_update, etc.
  scores: Record<string, number>          // keyed by beat: b1, b2, b3, b4, b5
  totalScore: number
  roundTimingsMs: Record<string, number>  // keyed by beat: b1, b2, etc.
  answerChanges: Record<string, number>   // keyed by decision
  revealsEngaged: Record<string, boolean> // b3_scry, b4_scry
  completedAt: string

  // Per-decision rows — inserted into game_answers
  decisions: GameAnswerRow[]

  // Behavioral summary for profile update
  firstSrcFr: number | null
  b2Delta: number | null
  conclusionType: string
}

// Shape of postMessage events from the iframe
export type VasantpurMessageEvent =
  | { type: 'vasantpur:ready' }
  | { type: 'vasantpur:decision'; payload: GameAnswerRow }
  | { type: 'vasantpur:beatComplete'; payload: { beat: number; timingMs: number } }
  | { type: 'vasantpur:scryEngaged'; payload: { key: string } }
  | { type: 'vasantpur:sessionComplete'; payload: VasantpurSessionPayload }
  | { type: 'vasantpur:log'; payload: Record<string, unknown> }
