export interface FactHighlight {
  text: string
  claim_type?: "verifiable" | "unverified" | "speculative"
  reason?: string
  impact?: string
}

export interface VulnerableSpan {
  text: string
  risk_explanation?: string
}

export interface Article {
  id: string
  headline: string
  publisher: string
  date: string
  content: string
  topic?: string | null
  processed: boolean
  reviewCount: number
  politicalLeaning: number
  emotionalIntensity: number
  tribalActivation: number
  threatSignal: number
  sensationalism: number
  groupConflict: number
  biasExplanation: string
  behaviouralAnalysis: string
  highlightedSentences: string[]
  rotatedMetric?: string | null
  // AI framing + signal fields (added — exist in DB but were missing from type)
  aiFramingDirection?: number | null
  aiLanguageIntensity?: number | null
  aiSensationalism?: number | null
  aiUsVsThemScore?: number | null
  aiThreatSignal?: number | null
  // Narrative integrity
  aiContextScore?: number | null
  aiContextNote?: string | null
  aiHeadlineScore?: number | null
  aiHeadlineNote?: string | null
  aiFactRatio?: number | null
  aiFactHighlights?: FactHighlight[] | null
  aiVulnerableScore?: number | null
  aiVulnerableSpans?: VulnerableSpan[] | null
  integrityModelVersion?: string | null
}

export interface Review {
  id: string
  articleId: string
  reviewerId: string
  political: number
  intensity: number
  sensationalism: number
  threat: number
  groupConflict: number
  comment: string
  highlightedSentence: string
  createdAt: string
}

export interface Reviewer {
  id: string
  name: string
  email: string
  reviewCount: number
  accuracy: number
  joinedAt: string
}

export interface DashboardStats {
  totalArticles: number
  totalReviews: number
  avgPoliticalLeaning: number
  avgEmotionalIntensity: number
  avgTribalActivation: number
  avgSensationalism?: number
  reviewerCount: number
  biasDistribution: { label: string; value: number; color: string }[]
  intensityDistribution: { range: string; count: number }[]
  tribalDistribution: { level: string; count: number }[]
  timelineData: { date: string; articles: number; avgBias: number }[]
}

export interface ReviewQueueItem {
  id: string
  article: Article
  aiPolitical: number
  aiIntensity: number
  aiTribal: number
  priority: "high" | "medium" | "low"
}
