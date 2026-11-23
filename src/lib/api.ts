import { supabase } from "./supabase"

import type {
  Article,
  DashboardStats,
  Reviewer,
  ReviewQueueItem,
} from "./types"

import { getCurrentUser } from "./auth"

/* ============================================================
   SCALE NORMALISATION
============================================================ */

function scaleAI(value: number | null | undefined): number {
  if (value == null) return 0
  return value * 5
}

function scaleAIFraming(value: number | null | undefined): number {
  if (value == null) return 0
  return value * 5
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

/* ============================================================
   AI VS HUMAN CALIBRATION
============================================================ */

export async function getAiHumanComparison() {
  const { data: articles, error: articleError } = await supabase
    .from("articles")
    .select(`
      id,
      ai_framing_direction,
      ai_emotional_intensity,
      ai_threat_signal,
      ai_sensationalism,
      ai_us_vs_them_score
    `)

  if (articleError || !articles) {
    console.error(articleError)
    throw articleError
  }

  const { data: reviews, error: reviewError } = await supabase
    .from("human_reviews")
    .select(`
      article_id,
      political,
      intensity,
      threat,
      sensational,
      group_conflict
    `)

  if (reviewError || !reviews) {
    console.error(reviewError)
    throw reviewError
  }

  const grouped: Record<string, any[]> = {}
  reviews.forEach((r) => {
    if (!grouped[r.article_id]) grouped[r.article_id] = []
    grouped[r.article_id].push(r)
  })

  const metrics = {
    political:      { aiSum: 0, humanSum: 0, humanValues: [] as number[], count: 0 },
    intensity:      { aiSum: 0, humanSum: 0, humanValues: [] as number[], count: 0 },
    threat:         { aiSum: 0, humanSum: 0, humanValues: [] as number[], count: 0 },
    sensational:    { aiSum: 0, humanSum: 0, humanValues: [] as number[], count: 0 },
    group_conflict: { aiSum: 0, humanSum: 0, humanValues: [] as number[], count: 0 },
  }

  articles.forEach((a) => {
    const humanSet = grouped[a.id]
    if (!humanSet || humanSet.length === 0) return

    const humanAvgField = (field: string) =>
      humanSet.reduce((s: number, r: any) => s + (r[field] || 0), 0) / humanSet.length

    const humanValuesField = (field: string): number[] =>
      humanSet.map((r: any) => r[field] || 0)

    const aiPolitical = Math.abs(scaleAIFraming(a.ai_framing_direction))
    const humanPoliticalValues = humanSet.map((r: any) => Math.abs(r.political || 0))
    const humanPoliticalAvg =
      humanPoliticalValues.reduce((s: number, v: number) => s + v, 0) /
      humanPoliticalValues.length
    metrics.political.aiSum += aiPolitical
    metrics.political.humanSum += humanPoliticalAvg
    metrics.political.humanValues.push(...humanPoliticalValues)
    metrics.political.count++

    metrics.intensity.aiSum += scaleAI(a.ai_emotional_intensity)
    metrics.intensity.humanSum += humanAvgField("intensity")
    metrics.intensity.humanValues.push(...humanValuesField("intensity"))
    metrics.intensity.count++

    metrics.threat.aiSum += scaleAI(a.ai_threat_signal)
    metrics.threat.humanSum += humanAvgField("threat")
    metrics.threat.humanValues.push(...humanValuesField("threat"))
    metrics.threat.count++

    metrics.sensational.aiSum += scaleAI(a.ai_sensationalism)
    metrics.sensational.humanSum += humanAvgField("sensational")
    metrics.sensational.humanValues.push(...humanValuesField("sensational"))
    metrics.sensational.count++

    metrics.group_conflict.aiSum += scaleAI(a.ai_us_vs_them_score)
    metrics.group_conflict.humanSum += humanAvgField("group_conflict")
    metrics.group_conflict.humanValues.push(...humanValuesField("group_conflict"))
    metrics.group_conflict.count++
  })

  return Object.entries(metrics).map(([key, value]) => {
    const aiAvg    = value.count ? value.aiSum    / value.count : 0
    const humanAvg = value.count ? value.humanSum / value.count : 0
    const delta    = humanAvg - aiAvg
    const humanSD  = stdDev(value.humanValues)

    let signal: string
    if (Math.abs(delta) < 0.5 && humanSD < 1) {
      signal = "Strong alignment"
    } else if (Math.abs(delta) >= 0.5 && humanSD < 1) {
      signal =
        delta > 0
          ? "Humans rate higher — possible AI underestimation"
          : "AI rates higher — possible AI overestimation"
    } else if (Math.abs(delta) < 0.5 && humanSD >= 1) {
      signal = "Aligned mean, high human disagreement"
    } else {
      signal = "Epistemic instability — high delta and high variance"
    }

    return {
      metric: key,
      aiAvg,
      humanAvg,
      delta,
      absDelta: Math.abs(delta),
      humanSD,
      reviewCount: value.humanValues.length,
      signal,
    }
  })
}

/* ============================================================
   ARTICLE MAPPER
============================================================ */

export function mapArticle(row: any): Article {
  return {
    id:                    row.id,
    headline:              row.headline || "",
    publisher:             row.publisher_name || row.publisher || "",
    date:                  row.publication_datetime || "",
    content:               row.content || row.body || "",
    topic:                 row.topic ?? null,
    processed:             row.processed === true,
    reviewCount:           Number(row.review_count) || 0,
    // Legacy scaled fields (kept for SpectrumBar / HeatBar compatibility elsewhere)
    politicalLeaning:      Number(row.ai_framing_direction) || 0,
    emotionalIntensity:    Number(row.ai_emotional_intensity) || 0,
    tribalActivation:      Number(row.ai_us_vs_them_score) || 0,
    threatSignal:          Number(row.ai_threat_signal) || 0,
    sensationalism:        Number(row.ai_sensationalism) || 0,
    groupConflict:         Number(row.ai_us_vs_them_score) || 0,
    biasExplanation:       row.bias_explanation || "",
    behaviouralAnalysis:   row.behavioural_analysis || "",
    highlightedSentences:  row.highlighted_sentences || [],
    rotatedMetric:         row.rotated_metric || null,
    // Raw AI signal fields (0-1 scale, used by InfluenceNarrativeMap)
    aiFramingDirection:    row.ai_framing_direction    ?? null,
    aiLanguageIntensity:   row.ai_language_intensity   ?? null,
    aiSensationalism:      row.ai_sensationalism        ?? null,
    aiUsVsThemScore:       row.ai_us_vs_them_score      ?? null,
    aiThreatSignal:        row.ai_threat_signal         ?? null,
    // Narrative integrity
    aiContextScore:        row.ai_context_score         ?? null,
    aiContextNote:         row.ai_context_note          || null,
    aiHeadlineScore:       row.ai_headline_alignment    ?? null,
    aiHeadlineNote:        row.ai_headline_note         || null,
    aiFactRatio:           row.ai_fact_ratio            ?? null,
    aiFactHighlights:      row.ai_fact_highlights       || null,
    aiVulnerableScore:     row.ai_vulnerable_group_risk ?? null,
    aiVulnerableSpans:     row.ai_vulnerable_spans      || null,
    integrityModelVersion: row.integrity_model_version  ?? null,
  }
}

/* ============================================================
   PERCENTILE ENGINE
============================================================ */

function percentileBuckets(rows: any[], field: string): number[] {
  const values = rows.map((r) => Number(r[field]) || 0).sort((a, b) => a - b)
  const n = values.length
  if (!n) return [0, 0, 0, 0, 0]
  const p10 = values[Math.floor(n * 0.1)]
  const p30 = values[Math.floor(n * 0.3)]
  const p70 = values[Math.floor(n * 0.7)]
  const p90 = values[Math.floor(n * 0.9)]
  const buckets = [0, 0, 0, 0, 0]
  rows.forEach((r) => {
    const v = Number(r[field]) || 0
    if      (v <= p10) buckets[0]++
    else if (v <= p30) buckets[1]++
    else if (v <= p70) buckets[2]++
    else if (v <= p90) buckets[3]++
    else               buckets[4]++
  })
  return buckets
}

/* ============================================================
   ARTICLE REVIEW COUNT
============================================================ */

export async function getArticleReviewStats(articleId: string) {
  const { count, error } = await supabase
    .from("human_reviews")
    .select("*", { count: "exact", head: true })
    .eq("article_id", articleId)

  if (error) {
    console.error(error)
    return { reviewCount: 0 }
  }
  return { reviewCount: count || 0 }
}

/* ============================================================
   ARTICLES
============================================================ */

export async function getArticles(): Promise<Article[]> {
  const { data, error } = await supabase
    .from("articles")
    .select(`
      *,
      human_reviews!human_reviews_article_id_fkey(count)
    `)
    .eq("processed", true)
    .not("ai_context_score", "is", null)
    .order("publication_datetime", { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return (data || []).map((row) => {
    const reviewCount =
      Array.isArray(row.human_reviews) && row.human_reviews.length > 0
        ? Number(row.human_reviews[0].count) || 0
        : 0
    return mapArticle({ ...row, review_count: reviewCount })
  })
}

export async function getArticleById(id: string): Promise<Article | null> {
  const { data, error } = await supabase
    .from("articles")
    .select(`
      *,
      human_reviews!human_reviews_article_id_fkey(count)
    `)
    .eq("id", id)
    .single()

  if (error || !data) {
    console.error(error)
    return null
  }

  const reviewCount =
    Array.isArray(data.human_reviews) && data.human_reviews.length > 0
      ? Number(data.human_reviews[0].count) || 0
      : 0

  return mapArticle({ ...data, review_count: reviewCount })
}

/* ============================================================
   REVIEWER
============================================================ */

export async function getReviewer(id: string): Promise<Reviewer | null> {
  const { data, error } = await supabase
    .from("reviewers")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) {
    console.error(error)
    return null
  }

  return {
    id:          data.id,
    name:        data.name || "",
    email:       data.email || "",
    reviewCount: data.review_count || 0,
    accuracy:    data.accuracy || 0,
    joinedAt:    data.created_at || "",
  }
}

/* ============================================================
   REVIEW QUEUE
============================================================ */

const MIN_CONTENT_LENGTH = 150

export async function getReviewQueue(authId: string): Promise<ReviewQueueItem[]> {
  const internalReviewerId = await getReviewerIdFromAuth(authId)

  const { data: reviewed, error: reviewedError } = await supabase
    .from("human_reviews")
    .select("article_id")
    .eq("reviewer_id", internalReviewerId)

  if (reviewedError) {
    console.error("Error fetching reviewed articles:", reviewedError)
    return []
  }

  const reviewedIds = reviewed?.map((r) => r.article_id) || []

  let query = supabase
    .from("articles")
    .select("*")
    .order("publication_datetime", { ascending: false })

  if (reviewedIds.length > 0) {
    query = query.not("id", "in", `(${reviewedIds.join(",")})`)
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching review queue:", error)
    return []
  }

  return (data || [])
    .filter(
      (row) => (row.content || row.body || "").trim().length >= MIN_CONTENT_LENGTH
    )
    .map((row) => {
      const article = mapArticle(row)
      let validation: any = null

      switch (row.rotated_metric) {
        case "context":
          if (row.ai_context_score !== null)
            validation = {
              metric: "context",
              score: row.ai_context_score,
              note: row.ai_context_note,
            }
          break
        case "headline":
          if (row.ai_headline_alignment !== null)
            validation = {
              metric: "headline",
              score: row.ai_headline_alignment,
              note: row.ai_headline_note,
            }
          break
        case "fact":
          if (row.ai_fact_ratio !== null)
            validation = {
              metric: "fact",
              score: row.ai_fact_ratio,
              highlights: row.ai_fact_highlights,
            }
          break
        case "vulnerable":
          if (row.ai_vulnerable_group_risk !== null)
            validation = {
              metric: "vulnerable",
              score: row.ai_vulnerable_group_risk,
              spans: row.ai_vulnerable_spans,
            }
          break
        default:
          validation = null
      }

      return {
        id: row.id,
        article,
        validation,
        aiPolitical: Number(row.ai_framing_direction) || 0,
        aiIntensity: Number(row.ai_emotional_intensity) || 0,
        aiTribal:    Number(row.ai_us_vs_them_score) || 0,
        priority:
          row.ai_us_vs_them_score > 0.7
            ? "high"
            : row.ai_us_vs_them_score > 0.4
            ? "medium"
            : "low",
      }
    })
}

/* ============================================================
   REVIEWER ID RESOLVER
============================================================ */

export async function getReviewerIdFromAuth(authId: string): Promise<string> {
  const { data, error } = await supabase
    .from("reviewers")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle()

  if (data?.id) return data.id

  const { data: userData } = await supabase.auth.getUser()
  const email = userData?.user?.email ?? null

  const { data: inserted, error: insertError } = await supabase
    .from("reviewers")
    .insert({ auth_id: authId, name: email ?? "Reviewer" })
    .select("id")
    .single()

  if (insertError || !inserted) {
    console.error("Failed to create reviewer profile:", insertError)
    throw new Error("Could not create reviewer profile")
  }

  return inserted.id
}

/* ============================================================
   SUBMIT REVIEW
============================================================ */

export async function submitReview(review: any) {
  const internalReviewerId = await getReviewerIdFromAuth(review.reviewer_id)

  const validationFields: any = {}
  if (review.metric === "context") {
    validationFields.context_validated    = review.agreed ?? null
    validationFields.context_disagreement = review.note || null
  }
  if (review.metric === "headline") {
    validationFields.headline_validated    = review.agreed ?? null
    validationFields.headline_disagreement = review.note || null
  }
  if (review.metric === "fact") {
    validationFields.fact_validated    = review.agreed ?? null
    validationFields.fact_disagreement = review.note || null
  }
  if (review.metric === "vulnerable") {
    validationFields.vulnerable_validated    = review.agreed ?? null
    validationFields.vulnerable_disagreement = review.note || null
  }

  const payload = {
    article_id:     review.article_id,
    reviewer_id:    internalReviewerId,
    political:      review.political,
    intensity:      review.intensity,
    sensational:    review.sensational,
    threat:         review.threat,
    group_conflict: review.group_conflict,
    highlight:      review.highlight || null,
    ...validationFields,
  }

  const { data, error } = await supabase
    .from("human_reviews")
    .upsert(payload, { onConflict: "reviewer_id,article_id" })
    .select()

  if (error) {
    console.error("submitReview error:", error)
    throw error
  }

  if (!data || data.length === 0)
    throw new Error("Review upsert succeeded but returned no data")

  return data[0]
}

/* ============================================================
   DASHBOARD STATS
============================================================ */

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data: rows, error } = await supabase
    .from("articles")
    .select(`
      ai_framing_direction,
      ai_emotional_intensity,
      ai_us_vs_them_score,
      ai_sensationalism,
      publication_datetime
    `)
    .eq("processed", true)
    .not("ai_context_score", "is", null)

  if (error || !rows) throw error

  const totalArticles = rows.length

  const avgPoliticalLeaning =
    rows.reduce((s, r) => s + Math.abs(r.ai_framing_direction || 0), 0) /
    totalArticles

  const avgEmotionalIntensity =
    rows.reduce((s, r) => s + (r.ai_emotional_intensity || 0), 0) / totalArticles

  const avgTribalActivation =
    rows.reduce((s, r) => s + (r.ai_us_vs_them_score || 0), 0) / totalArticles

  const avgSensationalism =
    rows.reduce((s, r) => s + (r.ai_sensationalism || 0), 0) / totalArticles

  const biasBuckets = { Left: 0, Center: 0, Right: 0 }
  rows.forEach((r) => {
    if      (r.ai_framing_direction < -0.2) biasBuckets.Left++
    else if (r.ai_framing_direction >  0.2) biasBuckets.Right++
    else                                    biasBuckets.Center++
  })

  const biasDistribution = [
    { label: "Left",   value: biasBuckets.Left,   color: "#3b82f6" },
    { label: "Center", value: biasBuckets.Center, color: "#6b7280" },
    { label: "Right",  value: biasBuckets.Right,  color: "#ef4444" },
  ]

  const sensBuckets   = percentileBuckets(rows, "ai_sensationalism")
  const tribalBuckets = percentileBuckets(rows, "ai_us_vs_them_score")

  const intensityDistribution = ["Very Low", "Low", "Medium", "High", "Very High"].map(
    (range, i) => ({ range, count: sensBuckets[i] })
  )

  const tribalDistribution = ["Very Low", "Low", "Medium", "High", "Very High"].map(
    (level, i) => ({ level, count: tribalBuckets[i] })
  )

  const timelineMap: Record<
    string,
    { date: string; articles: number; avgBias: number }
  > = {}
  rows.forEach((r) => {
    if (!r.publication_datetime) return
    const d = r.publication_datetime.slice(0, 10)
    if (!timelineMap[d]) timelineMap[d] = { date: d, articles: 0, avgBias: 0 }
    timelineMap[d].articles++
    timelineMap[d].avgBias += r.ai_framing_direction
  })

  const timelineData = Object.values(timelineMap)
    .map((d) => ({
      date:     d.date,
      articles: d.articles,
      avgBias:  d.avgBias / d.articles,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const { count: totalReviews } = await supabase
    .from("human_reviews")
    .select("*", { count: "exact", head: true })
  const { count: reviewerCount } = await supabase
    .from("reviewers")
    .select("*", { count: "exact", head: true })

  return {
    totalArticles,
    totalReviews:         totalReviews  || 0,
    reviewerCount:        reviewerCount || 0,
    avgPoliticalLeaning,
    avgEmotionalIntensity,
    avgTribalActivation,
    avgSensationalism,
    biasDistribution,
    intensityDistribution,
    tribalDistribution,
    timelineData,
  }
}

/* ============================================================
   REVIEWER ANALYTICS
============================================================ */

export async function getReviewerAnalytics() {
  const user = await getCurrentUser()
  if (!user) return null

  const internalReviewerId = await getReviewerIdFromAuth(user.id)

  const { data: reviews, error } = await supabase
    .from("human_reviews")
    .select("*")
    .eq("reviewer_id", internalReviewerId)

  if (error) {
    console.error("Reviewer analytics error:", error)
    throw error
  }

  const { count: totalProcessed } = await supabase
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("processed", true)

  const total = totalProcessed ?? 0

  if (!reviews || reviews.length === 0) {
    return {
      reviewed: 0, total, streak: 0,
      avgPolitical: 0, avgIntensity: 0, avgThreat: 0,
      avgSensationalism: 0, avgGroupConflict: 0,
      publishers: [], dominantType: "New reviewer",
      ideologyBias: "No pattern detected",
    }
  }

  const avg = (field: string) =>
    reviews.reduce((sum, r) => sum + (r[field] || 0), 0) / reviews.length

  const avgThreat         = avg("threat")
  const avgIntensity      = avg("intensity")
  const avgPolitical      = avg("political")
  const avgSensationalism = avg("sensational")
  const avgGroupConflict  = avg("group_conflict")

  let dominantType = "Balanced reviewer"
  if      (avgThreat    >= 4) dominantType = "Threat-sensitive reviewer"
  else if (avgIntensity >= 4) dominantType = "Emotion-sensitive reviewer"
  else if (avgPolitical >= 4) dominantType = "Ideology-sensitive reviewer"

  return {
    reviewed: reviews.length,
    total, streak: 0,
    avgPolitical, avgIntensity, avgThreat,
    avgSensationalism, avgGroupConflict,
    publishers: [], dominantType,
    ideologyBias: "Pattern emerging from review behavior",
  }
}

/* ============================================================
   COMMENTS
============================================================ */

export type Comment = {
  id: string
  article_id: string
  reviewer_id: string
  reviewer_name?: string
  comment: string
  start_char: number | null
  end_char: number | null
  selected_text: string | null
  parent_id: string | null
  upvotes: number
  downvotes: number
  flagged: boolean
  edited: boolean
  deleted: boolean
  created_at: string
  replies?: Comment[]
  user_vote?: 1 | -1 | null
}

export async function getArticleComments(articleId: string): Promise<Comment[]> {
  const user = await getCurrentUser()

  const { data: comments, error } = await supabase
    .from("article_comments")
    .select(`
      id, article_id, reviewer_id, comment,
      start_char, end_char, selected_text, parent_id,
      upvotes, downvotes, flagged, edited, deleted, created_at,
      reviewers (name)
    `)
    .eq("article_id", articleId)
    .eq("deleted", false)
    .order("created_at", { ascending: true })

  if (error) throw error
  if (!comments) return []

  let userVotes: Record<string, 1 | -1> = {}
  if (user) {
    const internalId = await getReviewerIdFromAuth(user.id)
    if (internalId) {
      const { data: votes } = await supabase
        .from("comment_votes")
        .select("comment_id, vote")
        .eq("reviewer_id", internalId)
      if (votes) votes.forEach((v) => { userVotes[v.comment_id] = v.vote })
    }
  }

  const shaped: Comment[] = comments.map((c: any) => ({
    id:            c.id,
    article_id:    c.article_id,
    reviewer_id:   c.reviewer_id,
    reviewer_name: c.reviewers?.name ?? "Reviewer",
    comment:       c.comment,
    start_char:    c.start_char,
    end_char:      c.end_char,
    selected_text: c.selected_text,
    parent_id:     c.parent_id,
    upvotes:       c.upvotes   ?? 0,
    downvotes:     c.downvotes ?? 0,
    flagged:       c.flagged   ?? false,
    edited:        c.edited    ?? false,
    deleted:       c.deleted   ?? false,
    created_at:    c.created_at,
    user_vote:     userVotes[c.id] ?? null,
    replies:       [],
  }))

  const topLevel: Comment[] = []
  const byId: Record<string, Comment> = {}
  shaped.forEach((c) => { byId[c.id] = c })
  shaped.forEach((c) => {
    if (c.parent_id && byId[c.parent_id]) byId[c.parent_id].replies!.push(c)
    else topLevel.push(c)
  })

  return topLevel
}

export async function addComment(payload: {
  article_id: string
  comment: string
  start_char?: number | null
  end_char?: number | null
  selected_text?: string | null
  parent_id?: string | null
}): Promise<Comment> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")

  const reviewerId = await getReviewerIdFromAuth(user.id)
  if (!reviewerId) throw new Error("Reviewer profile not found")

  const { data, error } = await supabase
    .from("article_comments")
    .insert({
      article_id:    payload.article_id,
      reviewer_id:   reviewerId,
      comment:       payload.comment,
      start_char:    payload.start_char    ?? null,
      end_char:      payload.end_char      ?? null,
      selected_text: payload.selected_text ?? null,
      parent_id:     payload.parent_id     ?? null,
    })
    .select(
      `id, article_id, reviewer_id, comment, start_char, end_char,
       selected_text, parent_id, upvotes, downvotes, flagged,
       edited, deleted, created_at, reviewers (name)`
    )
    .single()

  if (error) throw error

  return {
    ...(data as any),
    reviewer_name: (data as any).reviewers?.name ?? "Reviewer",
    replies:   [],
    user_vote: null,
  }
}

export async function editComment(
  commentId: string,
  newText: string
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")
  const reviewerId = await getReviewerIdFromAuth(user.id)
  const { error } = await supabase
    .from("article_comments")
    .update({ comment: newText, edited: true })
    .eq("id", commentId)
    .eq("reviewer_id", reviewerId)
  if (error) throw error
}

export async function deleteComment(commentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")
  const reviewerId = await getReviewerIdFromAuth(user.id)
  const { error } = await supabase
    .from("article_comments")
    .update({ deleted: true })
    .eq("id", commentId)
    .eq("reviewer_id", reviewerId)
  if (error) throw error
}

export async function voteComment(
  commentId: string,
  vote: 1 | -1
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")
  const reviewerId = await getReviewerIdFromAuth(user.id)
  if (!reviewerId) throw new Error("Reviewer profile not found")

  const { data: existing } = await supabase
    .from("comment_votes")
    .select("id, vote")
    .eq("comment_id", commentId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle()

  if (existing) {
    if (existing.vote === vote) {
      await supabase.from("comment_votes").delete().eq("id", existing.id)
      const { data: current } = await supabase
        .from("article_comments")
        .select("upvotes, downvotes")
        .eq("id", commentId)
        .single()
      if (current) {
        await supabase.from("article_comments").update({
          upvotes:   vote === 1  ? Math.max(0, current.upvotes - 1)   : current.upvotes,
          downvotes: vote === -1 ? Math.max(0, current.downvotes - 1) : current.downvotes,
        }).eq("id", commentId)
      }
    } else {
      await supabase.from("comment_votes").update({ vote }).eq("id", existing.id)
      const { data: current } = await supabase
        .from("article_comments")
        .select("upvotes, downvotes")
        .eq("id", commentId)
        .single()
      if (current) {
        await supabase.from("article_comments").update({
          upvotes:   vote === 1  ? current.upvotes + 1   : Math.max(0, current.upvotes - 1),
          downvotes: vote === -1 ? current.downvotes + 1 : Math.max(0, current.downvotes - 1),
        }).eq("id", commentId)
      }
    }
  } else {
    await supabase
      .from("comment_votes")
      .insert({ comment_id: commentId, reviewer_id: reviewerId, vote })
    const { data: current } = await supabase
      .from("article_comments")
      .select("upvotes, downvotes")
      .eq("id", commentId)
      .single()
    if (current) {
      await supabase.from("article_comments").update({
        upvotes:   vote === 1  ? current.upvotes + 1   : current.upvotes,
        downvotes: vote === -1 ? current.downvotes + 1 : current.downvotes,
      }).eq("id", commentId)
    }
  }
}

export async function flagComment(
  commentId: string,
  reason?: string
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Not authenticated")
  const reviewerId = await getReviewerIdFromAuth(user.id)
  if (!reviewerId) throw new Error("Reviewer profile not found")

  const { error } = await supabase
    .from("comment_flags")
    .upsert(
      { comment_id: commentId, reviewer_id: reviewerId, reason: reason ?? null },
      { onConflict: "comment_id,reviewer_id" }
    )
  if (error) throw error

  await supabase
    .from("article_comments")
    .update({ flagged: true })
    .eq("id", commentId)
}

/* ============================================================
   CLUSTER TYPES
============================================================ */

export type NarrativeArcSection = {
  text: string
  citations: string[]
}

export type NarrativeArc = {
  origin:        NarrativeArcSection
  propagation:   NarrativeArcSection
  fault_lines:   NarrativeArcSection
  silences:      NarrativeArcSection
  current_state: NarrativeArcSection
}

export type ClusterIdentity = {
  id: string
  title: string
  summary: string | null
  dominant_topic: string | null
  first_seen: string
  last_seen: string
  article_count: number
  publisher_count: number
  publishers: string[]
  publishers_silent: string[]
  silent_count: number
  is_active: boolean
  narrative_arc: NarrativeArc | null
  narrative_arc_generated_at: string | null
  report_enabled:             boolean 
  report_cache:               Record<string, any> | null
}


export type ClusterSignals = {
  avg_framing_direction: number | null
  avg_intensity: number | null
  avg_threat_signal: number | null
  avg_fact_ratio: number | null
  avg_context_score: number | null
  left_count: number
  neutral_count: number
  right_count: number
  framing_spread: number | null
}

export type ClusterPublisherStat = {
  publisher_name: string
  article_count: number
  avg_framing: number | null
  avg_intensity: number | null
  avg_fact_ratio: number | null
  avg_threat_signal: number | null
  avg_context_score: number | null
}

export type ClusterArticle = {
  id: string
  headline: string
  publisher_name: string
  publication_datetime: string
  url: string | null
  ai_framing_direction: number | null
  ai_language_intensity: number | null
  ai_fact_ratio: number | null
  ai_threat_signal: number | null
  ai_context_score: number | null
  ai_sensationalism: number | null
  ai_vulnerable_group_risk: number | null
  political_leaning: string | null
  likely_syndicated: boolean | null
  wire_source: string | null
  human_framing: number | null
  human_intensity: number | null
  review_count: number
}

export type ClusterTimelinePoint = {
  date: string
  article_count: number
  avg_framing: number
  avg_intensity: number
}

export type ClusterIntelligence = {
  identity: ClusterIdentity
  signals: ClusterSignals
  publisher_stats: ClusterPublisherStat[]
  articles: ClusterArticle[]
  timeline: ClusterTimelinePoint[]
  has_timeline: boolean
}

// ── UPDATED: added publishers, publishers_silent, avg_language_intensity,
//            avg_fact_ratio, narrative_arc fields needed by SignalsDashboard
//            and DraftComparison. avg_intensity kept for backward compat.
export type ClusterListItem = {
  id: string
  title: string
  summary: string | null
  dominant_topic: string | null
  first_seen: string
  last_seen: string
  article_count: number
  publisher_count: number
  silent_count: number
  publishers: string[]
  publishers_silent: string[]
  avg_framing_direction: number | null
  avg_intensity: number | null           // kept — used by ClusterListPage
  avg_language_intensity: number | null  // added — used by DraftComparison
  avg_fact_ratio: number | null          // added — used by DraftComparison
  narrative_arc: NarrativeArc | null     // added — used by SignalsDashboard
  is_active: boolean
  // Set by the pipeline's rank_stories.py; absent until it has run.
  importance_score?: number | null
  importance_tier?: "major" | "major_soft" | null
  lifecycle?: "breaking" | "developing" | "settled" | null
  importance_signals?: ImportanceSignals | null
}

export type ImportanceSignals = {
  publishers_24h: number
  cross_spectrum: boolean
  google_news_sim: number
  articles_last_6h: number
  articles_prev_6h: number
  wire: boolean
  staying_power: boolean
}

/* ============================================================
   CLUSTER IDENTITY
============================================================ */

export async function getClusterIdentity(
  clusterId: string
): Promise<ClusterIdentity | null> {
  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      id, title, summary, dominant_topic,
      first_seen, last_seen,
      article_count, publisher_count,
      publishers, publishers_silent, silent_count,
      is_active, narrative_arc, narrative_arc_generated_at,
      report_enabled, report_cache
    `)
    .eq("id", clusterId)
    .single()
  if (error || !data) {
    console.error("getClusterIdentity:", error)
    return null
  }
  return {
    id:                         data.id,
    title:                      data.title             || "Untitled cluster",
    summary:                    data.summary           || null,
    dominant_topic:             data.dominant_topic    || null,
    first_seen:                 data.first_seen,
    last_seen:                  data.last_seen,
    article_count:              data.article_count     || 0,
    publisher_count:            data.publisher_count   || 0,
    publishers:                 data.publishers        || [],
    publishers_silent:          data.publishers_silent || [],
    silent_count:               data.silent_count      || 0,
    is_active:                  data.is_active         ?? false,
    narrative_arc:              data.narrative_arc     || null,
    narrative_arc_generated_at: data.narrative_arc_generated_at || null,
    report_enabled:             data.report_enabled    ?? false,
    report_cache:               data.report_cache      ?? null,
  }
}

/* ============================================================
   CLUSTER SIGNALS
============================================================ */

export async function getClusterSignals(
  clusterId: string
): Promise<ClusterSignals> {
  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      avg_framing_direction, avg_intensity, avg_threat_signal,
      avg_fact_ratio, avg_context_score,
      left_count, neutral_count, right_count, framing_spread
    `)
    .eq("id", clusterId)
    .single()

  if (error || !data) {
    console.error("getClusterSignals:", error)
    return {
      avg_framing_direction: null, avg_intensity: null,
      avg_threat_signal: null, avg_fact_ratio: null,
      avg_context_score: null, left_count: 0,
      neutral_count: 0, right_count: 0, framing_spread: null,
    }
  }

  return {
    avg_framing_direction: data.avg_framing_direction ?? null,
    avg_intensity:         data.avg_intensity         ?? null,
    avg_threat_signal:     data.avg_threat_signal     ?? null,
    avg_fact_ratio:        data.avg_fact_ratio         ?? null,
    avg_context_score:     data.avg_context_score      ?? null,
    left_count:            data.left_count    || 0,
    neutral_count:         data.neutral_count || 0,
    right_count:           data.right_count   || 0,
    framing_spread:        data.framing_spread ?? null,
  }
}

/* ============================================================
   CLUSTER PUBLISHER STATS
============================================================ */

export async function getClusterPublisherStats(
  clusterId: string
): Promise<ClusterPublisherStat[]> {
  const { data, error } = await supabase
    .from("cluster_publisher_stats")
    .select(`
      publisher_name, article_count,
      avg_framing, avg_intensity, avg_fact_ratio,
      avg_threat_signal, avg_context_score
    `)
    .eq("cluster_id", clusterId)
    .order("article_count", { ascending: false })

  if (error) {
    console.error("getClusterPublisherStats:", error)
    return []
  }

  return (data || []).map((row) => ({
    publisher_name:    row.publisher_name,
    article_count:     row.article_count    || 0,
    avg_framing:       row.avg_framing       ?? null,
    avg_intensity:     row.avg_intensity     ?? null,
    avg_fact_ratio:    row.avg_fact_ratio     ?? null,
    avg_threat_signal: row.avg_threat_signal ?? null,
    avg_context_score: row.avg_context_score ?? null,
  }))
}

/* ============================================================
   CLUSTER ARTICLES
============================================================ */

export async function getClusterArticles(
  clusterId: string
): Promise<ClusterArticle[]> {
  const { data: articles, error } = await supabase
    .from("articles")
    .select(`
      id, headline, publisher_name, publication_datetime, url,
      ai_framing_direction, ai_language_intensity, ai_fact_ratio,
      ai_threat_signal, ai_context_score, ai_sensationalism,
      ai_vulnerable_group_risk, political_leaning,
      likely_syndicated, wire_source, review_count
    `)
    .eq("story_cluster_id", clusterId)
    .order("publication_datetime", { ascending: true })

  if (error || !articles) {
    console.error("getClusterArticles:", error)
    return []
  }

  if (articles.length === 0) return []

  const articleIds = articles.map((a) => a.id)
  const { data: reviews } = await supabase
    .from("human_review_aggregates")
    .select("article_id, human_framing, human_intensity, review_count")
    .in("article_id", articleIds)

  const reviewMap: Record<
    string,
    { human_framing: number | null; human_intensity: number | null; review_count: number }
  > = {}

  if (reviews) {
    reviews.forEach((r) => {
      reviewMap[r.article_id] = {
        human_framing:   r.human_framing   ?? null,
        human_intensity: r.human_intensity ?? null,
        review_count:    r.review_count    || 0,
      }
    })
  }

  return articles.map((a) => ({
    id:                       a.id,
    headline:                 a.headline              || "",
    publisher_name:           a.publisher_name        || "",
    publication_datetime:     a.publication_datetime  || "",
    url:                      a.url                   || null,
    ai_framing_direction:     a.ai_framing_direction  ?? null,
    ai_language_intensity:    a.ai_language_intensity ?? null,
    ai_fact_ratio:            a.ai_fact_ratio         ?? null,
    ai_threat_signal:         a.ai_threat_signal      ?? null,
    ai_context_score:         a.ai_context_score      ?? null,
    ai_sensationalism:        a.ai_sensationalism     ?? null,
    ai_vulnerable_group_risk: a.ai_vulnerable_group_risk ?? null,
    political_leaning:        a.political_leaning     ?? null,
    likely_syndicated:        a.likely_syndicated     ?? null,
    wire_source:              a.wire_source           ?? null,
    human_framing:            reviewMap[a.id]?.human_framing   ?? null,
    human_intensity:          reviewMap[a.id]?.human_intensity ?? null,
    review_count:             reviewMap[a.id]?.review_count    ?? a.review_count ?? 0,
  }))
}

/* ============================================================
   TIMELINE BUILDER
============================================================ */

function buildTimeline(articles: ClusterArticle[]): {
  timeline: ClusterTimelinePoint[]
  has_timeline: boolean
} {
  if (articles.length < 12) return { timeline: [], has_timeline: false }

  const dates = articles
    .map((a) => new Date(a.publication_datetime).getTime())
    .filter((t) => !isNaN(t))

  if (dates.length < 2) return { timeline: [], has_timeline: false }

  const spanHours =
    (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60)
  if (spanHours < 24) return { timeline: [], has_timeline: false }

  const byDate: Record<
    string,
    { framing: number[]; intensity: number[]; count: number }
  > = {}

  articles.forEach((a) => {
    if (!a.publication_datetime) return
    const date = a.publication_datetime.slice(0, 10)
    if (!byDate[date]) byDate[date] = { framing: [], intensity: [], count: 0 }
    byDate[date].count++
    if (a.ai_framing_direction  != null) byDate[date].framing.push(a.ai_framing_direction)
    if (a.ai_language_intensity != null) byDate[date].intensity.push(a.ai_language_intensity)
  })

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

  const timeline = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      article_count: d.count,
      avg_framing:   parseFloat(avg(d.framing).toFixed(3)),
      avg_intensity: parseFloat(avg(d.intensity).toFixed(3)),
    }))

  return { timeline, has_timeline: true }
}

/* ============================================================
   CLUSTER INTELLIGENCE LOADER
============================================================ */

export async function getClusterIntelligence(
  clusterId: string
): Promise<ClusterIntelligence | null> {
  const [identity, signals, publisher_stats, articles] = await Promise.all([
    getClusterIdentity(clusterId),
    getClusterSignals(clusterId),
    getClusterPublisherStats(clusterId),
    getClusterArticles(clusterId),
  ])

  if (!identity) return null

  const { timeline, has_timeline } = buildTimeline(articles)

  return { identity, signals, publisher_stats, articles, timeline, has_timeline }
}

/* ============================================================
   CLUSTER LIST QUERIES
   UPDATED: getRecentClusters and getTrendingClusters now fetch
   publishers, publishers_silent, avg_language_intensity,
   avg_fact_ratio, and narrative_arc for the new pages.
============================================================ */

export async function getRecentClusters(limit = 20): Promise<ClusterListItem[]> {
  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      id, title, summary, dominant_topic,
      first_seen, last_seen,
      article_count, publisher_count, silent_count,
      publishers, publishers_silent,
      avg_framing_direction, avg_intensity,
      avg_language_intensity, avg_fact_ratio,
      narrative_arc, is_active
    `)
    .order("last_seen", { ascending: false })
    .limit(limit)

  if (error) { console.error("getRecentClusters:", error); return [] }

  return (data || []).map((row) => ({
    id:                    row.id,
    title:                 row.title                 || "Untitled cluster",
    summary:               row.summary               || null,
    dominant_topic:        row.dominant_topic        || null,
    first_seen:            row.first_seen,
    last_seen:             row.last_seen,
    article_count:         row.article_count         || 0,
    publisher_count:       row.publisher_count       || 0,
    silent_count:          row.silent_count          || 0,
    publishers:            row.publishers            || [],
    publishers_silent:     row.publishers_silent     || [],
    avg_framing_direction: row.avg_framing_direction ?? null,
    avg_intensity:         row.avg_intensity         ?? null,
    avg_language_intensity:row.avg_language_intensity ?? null,
    avg_fact_ratio:        row.avg_fact_ratio         ?? null,
    narrative_arc:         row.narrative_arc          ?? null,
    is_active:             row.is_active              ?? false,
  }))
}

/* Major stories: the few clusters rank_stories.py marks as major news right now.
   Returns null when the ranking columns don't exist yet, so callers can fall back. */
export async function getMajorClusters(): Promise<ClusterListItem[] | null> {
  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      id, title, summary, dominant_topic,
      first_seen, last_seen,
      article_count, publisher_count, silent_count,
      publishers, publishers_silent,
      avg_framing_direction, avg_intensity,
      avg_language_intensity, avg_fact_ratio,
      narrative_arc, is_active,
      importance_score, importance_tier, lifecycle, importance_signals
    `)
    .in("importance_tier", ["major", "major_soft"])
    .order("importance_score", { ascending: false })
    .limit(30)

  if (error) { console.warn("getMajorClusters:", error.message); return null }

  return (data || []).map((row) => ({
    id:                    row.id,
    title:                 row.title                 || "Untitled cluster",
    summary:               row.summary               || null,
    dominant_topic:        row.dominant_topic        || null,
    first_seen:            row.first_seen,
    last_seen:             row.last_seen,
    article_count:         row.article_count         || 0,
    publisher_count:       row.publisher_count       || 0,
    silent_count:          row.silent_count          || 0,
    publishers:            row.publishers            || [],
    publishers_silent:     row.publishers_silent     || [],
    avg_framing_direction: row.avg_framing_direction ?? null,
    avg_intensity:         row.avg_intensity         ?? null,
    avg_language_intensity:row.avg_language_intensity ?? null,
    avg_fact_ratio:        row.avg_fact_ratio         ?? null,
    narrative_arc:         row.narrative_arc          ?? null,
    is_active:             row.is_active              ?? false,
    importance_score:      row.importance_score       ?? null,
    importance_tier:       row.importance_tier        ?? null,
    lifecycle:             row.lifecycle              ?? null,
    importance_signals:    row.importance_signals     ?? null,
  }))
}

export async function getTrendingClusters(
  limit = 10
): Promise<ClusterListItem[]> {
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      id, title, summary, dominant_topic,
      first_seen, last_seen,
      article_count, publisher_count, silent_count,
      publishers, publishers_silent,
      avg_framing_direction, avg_intensity,
      avg_language_intensity, avg_fact_ratio,
      narrative_arc, is_active
    `)
    .gte("last_seen", cutoff)
    .order("article_count", { ascending: false })
    .limit(limit)

  if (error) { console.error("getTrendingClusters:", error); return [] }

  return (data || []).map((row) => ({
    id:                    row.id,
    title:                 row.title                 || "Untitled cluster",
    summary:               row.summary               || null,
    dominant_topic:        row.dominant_topic        || null,
    first_seen:            row.first_seen,
    last_seen:             row.last_seen,
    article_count:         row.article_count         || 0,
    publisher_count:       row.publisher_count       || 0,
    silent_count:          row.silent_count          || 0,
    publishers:            row.publishers            || [],
    publishers_silent:     row.publishers_silent     || [],
    avg_framing_direction: row.avg_framing_direction ?? null,
    avg_intensity:         row.avg_intensity         ?? null,
    avg_language_intensity:row.avg_language_intensity ?? null,
    avg_fact_ratio:        row.avg_fact_ratio         ?? null,
    narrative_arc:         row.narrative_arc          ?? null,
    is_active:             row.is_active              ?? false,
  }))
}

export async function getClustersByTopic(
  topic: string,
  limit = 20
): Promise<ClusterListItem[]> {
  const { data, error } = await supabase
    .from("story_clusters")
    .select(`
      id, title, summary, dominant_topic,
      first_seen, last_seen,
      article_count, publisher_count, silent_count,
      publishers, publishers_silent,
      avg_framing_direction, avg_intensity,
      avg_language_intensity, avg_fact_ratio,
      narrative_arc, is_active
    `)
    .eq("dominant_topic", topic)
    .order("last_seen", { ascending: false })
    .limit(limit)

  if (error) { console.error("getClustersByTopic:", error); return [] }

  return (data || []).map((row) => ({
    id:                    row.id,
    title:                 row.title                 || "Untitled cluster",
    summary:               row.summary               || null,
    dominant_topic:        row.dominant_topic        || null,
    first_seen:            row.first_seen,
    last_seen:             row.last_seen,
    article_count:         row.article_count         || 0,
    publisher_count:       row.publisher_count       || 0,
    silent_count:          row.silent_count          || 0,
    publishers:            row.publishers            || [],
    publishers_silent:     row.publishers_silent     || [],
    avg_framing_direction: row.avg_framing_direction ?? null,
    avg_intensity:         row.avg_intensity         ?? null,
    avg_language_intensity:row.avg_language_intensity ?? null,
    avg_fact_ratio:        row.avg_fact_ratio         ?? null,
    narrative_arc:         row.narrative_arc          ?? null,
    is_active:             row.is_active              ?? false,
  }))
}

/* ============================================================
   METRIC COVERAGE
============================================================ */

export type MetricCoverage = {
  political: number
  intensity: number
  sensational: number
  threat: number
  group_conflict: number
}

export async function getGlobalMetricCoverage(): Promise<MetricCoverage> {
  const { data, error } = await supabase
    .from("human_reviews")
    .select("political, intensity, sensational, threat, group_conflict")

  if (error || !data) {
    console.error("getGlobalMetricCoverage:", error)
    return { political: 0, intensity: 0, sensational: 0, threat: 0, group_conflict: 0 }
  }

  return {
    political:      data.filter((r) => r.political      != null).length,
    intensity:      data.filter((r) => r.intensity      != null).length,
    sensational:    data.filter((r) => r.sensational    != null).length,
    threat:         data.filter((r) => r.threat         != null).length,
    group_conflict: data.filter((r) => r.group_conflict != null).length,
  }
}

export async function assignSessionMetrics(): Promise<[string, string]> {
  const coverage = await getGlobalMetricCoverage()
  const ranked = (Object.entries(coverage) as [string, number][])
    .sort((a, b) => a[1] - b[1])
  const top4 = ranked.slice(0, 4)
  const shuffled = top4.sort(() => Math.random() - 0.5)
  return [shuffled[0][0], shuffled[1][0]] as [string, string]
}

/* ============================================================
   FILTERED + GAP-PRIORITY REVIEW QUEUE
============================================================ */

export type ReviewFilter = {
  topic?: string
  publisher?: string
  clusterId?: string
}

export type ReviewQueueItemV2 = {
  article: Article
  validation: any
  gapScore: number
  missingMetrics: string[]
}

export async function getFilteredReviewQueue(
  authId: string,
  filters: ReviewFilter = {},
  sessionMetrics: string[] = []
): Promise<ReviewQueueItemV2[]> {
  const internalReviewerId = await getReviewerIdFromAuth(authId)

  const { data: reviewed } = await supabase
    .from("human_reviews")
    .select("article_id, reviewed_metrics")
    .eq("reviewer_id", internalReviewerId)

  const reviewedIds = reviewed?.map((r) => r.article_id) || []

  const fullyAnsweredIds = new Set<string>()
  if (sessionMetrics.length > 0 && reviewed) {
    reviewed.forEach((r) => {
      const answered = (r.reviewed_metrics?.answered || []) as string[]
      const allCovered = sessionMetrics.every((m) => answered.includes(m))
      if (allCovered) fullyAnsweredIds.add(r.article_id)
    })
  }

  let query = supabase
    .from("articles")
    .select("*")
    .eq("processed", true)
    .not("ai_context_score", "is", null)
    .order("publication_datetime", { ascending: false })
    .limit(120)

  if (filters.topic)     query = query.eq("topic", filters.topic)
  if (filters.publisher) query = query.eq("publisher_name", filters.publisher)
  if (filters.clusterId) query = query.eq("story_cluster_id", filters.clusterId)

  if (reviewedIds.length > 0) {
    query = query.not("id", "in", `(${reviewedIds.join(",")})`)
  }

  const { data: articles, error } = await query
  if (error || !articles) {
    console.error("getFilteredReviewQueue:", error)
    return []
  }

  const MIN_CONTENT_LENGTH = 150
  const eligible = articles.filter(
    (row) =>
      (row.content || "").trim().length >= MIN_CONTENT_LENGTH &&
      !fullyAnsweredIds.has(row.id)
  )

  if (eligible.length === 0) return []

  const eligibleIds = eligible.map((a) => a.id)
  const { data: coverageRows } = await supabase
    .from("article_metric_coverage")
    .select("*")
    .in("article_id", eligibleIds)

  const coverageMap: Record<string, any> = {}
  if (coverageRows) {
    coverageRows.forEach((row) => { coverageMap[row.article_id] = row })
  }

  const clusterIds = [...new Set(eligible.map((a) => a.story_cluster_id).filter(Boolean))]
  const clusterGapMap: Record<string, number> = {}

  if (clusterIds.length > 0) {
    const { data: clusterCoverage } = await supabase
      .from("article_metric_coverage")
      .select("article_id, total_signal_coverage")
      .in(
        "article_id",
        eligible
          .filter((a) => clusterIds.includes(a.story_cluster_id))
          .map((a) => a.id)
      )

    const clusterTotals: Record<string, { sum: number; count: number }> = {}
    if (clusterCoverage) {
      const articleToCluster: Record<string, string> = {}
      eligible.forEach((a) => {
        if (a.story_cluster_id) articleToCluster[a.id] = a.story_cluster_id
      })

      clusterCoverage.forEach((row) => {
        const cid = articleToCluster[row.article_id]
        if (!cid) return
        if (!clusterTotals[cid]) clusterTotals[cid] = { sum: 0, count: 0 }
        clusterTotals[cid].sum += row.total_signal_coverage || 0
        clusterTotals[cid].count++
      })

      Object.entries(clusterTotals).forEach(([cid, { sum, count }]) => {
        clusterGapMap[cid] = count > 0 ? 1 - (sum / count) / 5 : 1
      })
    }
  }

  const METRICS = ["political", "intensity", "sensational", "threat", "group_conflict"]

  const scored = eligible.map((row) => {
    const coverage = coverageMap[row.id]
    const missingMetrics: string[] = []

    if (coverage) {
      METRICS.forEach((m) => {
        const key = `${m}_reviews` as keyof typeof coverage
        if ((coverage[key] || 0) === 0) missingMetrics.push(m)
      })
    } else {
      missingMetrics.push(...METRICS)
    }

    const sessionGap = sessionMetrics.filter((m) =>
      missingMetrics.includes(m)
    ).length

    const clusterGap = row.story_cluster_id
      ? (clusterGapMap[row.story_cluster_id] || 0)
      : 0

    const gapScore = sessionGap * 10 + missingMetrics.length + clusterGap * 2

    let validation: any = null
    switch (row.rotated_metric) {
      case "context":
        if (row.ai_context_score != null)
          validation = { metric: "context", score: row.ai_context_score, note: row.ai_context_note }
        break
      case "headline":
        if (row.ai_headline_alignment != null)
          validation = { metric: "headline", score: row.ai_headline_alignment, note: row.ai_headline_note }
        break
      case "fact":
        if (row.ai_fact_ratio != null)
          validation = { metric: "fact", score: row.ai_fact_ratio, highlights: row.ai_fact_highlights }
        break
      case "vulnerable":
        if (row.ai_vulnerable_group_risk != null)
          validation = { metric: "vulnerable", score: row.ai_vulnerable_group_risk, spans: row.ai_vulnerable_spans }
        break
    }

    return {
      article: mapArticle(row),
      validation,
      gapScore,
      missingMetrics,
    }
  })

  return scored.sort((a, b) => b.gapScore - a.gapScore)
}

/* ============================================================
   SUBMIT REVIEW V2
============================================================ */

export async function submitReviewV2(review: {
  article_id: string
  reviewer_id: string
  answeredMetrics: Record<string, number>
  skippedMetrics: string[]
  shownMetrics: string[]
  integrity?: {
    metric: string
    agreed: boolean | null
    note: string
  } | null
  highlight?: string | null
}) {
  const internalReviewerId = await getReviewerIdFromAuth(review.reviewer_id)

  const reviewedMetrics = {
    shown:    review.shownMetrics,
    answered: Object.keys(review.answeredMetrics),
    skipped:  review.skippedMetrics,
  }

  const metricFields: any = {}
  if (review.answeredMetrics.political      != null) metricFields.political      = review.answeredMetrics.political
  if (review.answeredMetrics.intensity      != null) metricFields.intensity      = review.answeredMetrics.intensity
  if (review.answeredMetrics.sensational    != null) metricFields.sensational    = review.answeredMetrics.sensational
  if (review.answeredMetrics.threat         != null) metricFields.threat         = review.answeredMetrics.threat
  if (review.answeredMetrics.group_conflict != null) metricFields.group_conflict = review.answeredMetrics.group_conflict

  const integrityFields: any = {}
  if (review.integrity) {
    const { metric, agreed, note } = review.integrity
    if (metric === "context")    { integrityFields.context_validated    = agreed; integrityFields.context_disagreement    = note || null }
    if (metric === "headline")   { integrityFields.headline_validated   = agreed; integrityFields.headline_disagreement   = note || null }
    if (metric === "fact")       { integrityFields.fact_validated       = agreed; integrityFields.fact_disagreement       = note || null }
    if (metric === "vulnerable") { integrityFields.vulnerable_validated = agreed; integrityFields.vulnerable_disagreement = note || null }
  }

  const payload = {
    article_id:       review.article_id,
    reviewer_id:      internalReviewerId,
    highlight:        review.highlight || null,
    reviewed_metrics: reviewedMetrics,
    ...metricFields,
    ...integrityFields,
  }

  const { data, error } = await supabase
    .from("human_reviews")
    .upsert(payload, { onConflict: "reviewer_id,article_id" })
    .select()

  if (error) {
    console.error("submitReviewV2 error:", error)
    throw error
  }

  return data?.[0]
}
