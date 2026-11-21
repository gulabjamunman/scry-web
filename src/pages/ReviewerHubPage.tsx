import { useEffect, useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@/lib/auth"
import { signOut } from "@/lib/auth"
import {
  getReviewerAnalytics,
  assignSessionMetrics,
  getFilteredReviewQueue,
  submitReviewV2,
} from "@/lib/api"
import type { ReviewQueueItemV2 } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  LogOut, PlayCircle, ChevronRight, ChevronLeft,
  SkipForward, CheckCircle2, Flame, Tag,
  Building2, Layers, Shuffle, X, SlidersHorizontal,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = "dashboard" | "setup" | "review"
type FilterLens = "topic" | "publisher" | "cluster" | "random"

type VerdictOption = { label: string; description: string; value: number }

// ─── Metric definitions ───────────────────────────────────────────────────────

const METRIC_META: Record<string, {
  label: string
  question: string
  options: VerdictOption[]
}> = {
  political: {
    label: "Political Framing",
    question: "How does this article position itself politically?",
    options: [
      { value: 1, label: "Firmly neutral",      description: "No political framing detectable — reads as straight reporting" },
      { value: 2, label: "Mildly inflected",    description: "Subtle word choices hint at a lean, but nothing explicit" },
      { value: 3, label: "Noticeably framed",   description: "Clear perspective — certain voices centred, others marginalised" },
      { value: 4, label: "Strongly positioned", description: "Consistent political narrative woven throughout" },
      { value: 5, label: "Openly partisan",     description: "Reads as advocacy — a political position is being argued" },
    ],
  },
  intensity: {
    label: "Language Intensity",
    question: "How charged is the language in this article?",
    options: [
      { value: 1, label: "Dry and factual",    description: "Clinical tone — reads like a wire report or official statement" },
      { value: 2, label: "Measured",           description: "Mostly restrained — occasional opinion but generally calm" },
      { value: 3, label: "Noticeably loaded",  description: "Word choices carry emotional weight beyond the facts" },
      { value: 4, label: "Highly charged",     description: "Emotional language used consistently throughout" },
      { value: 5, label: "Inflammatory",       description: "Language appears designed to provoke a strong reaction" },
    ],
  },
  sensational: {
    label: "Sensationalism",
    question: "How does the framing relate to the actual event weight?",
    options: [
      { value: 1, label: "Proportionate",          description: "Coverage matches the significance of the event accurately" },
      { value: 2, label: "Slightly amplified",     description: "Minor exaggeration — framing a little larger than the event" },
      { value: 3, label: "Noticeably inflated",    description: "Event presented as more dramatic than it appears" },
      { value: 4, label: "Heavily sensationalised",description: "Language and framing far exceed the event" },
      { value: 5, label: "Clickbait territory",    description: "Headline or framing appears designed to shock or mislead" },
    ],
  },
  threat: {
    label: "Threat Signal",
    question: "Does this article activate fear or hostility in the reader?",
    options: [
      { value: 1, label: "No threat signal",    description: "Calm and informational — no attempt to create alarm" },
      { value: 2, label: "Mild concern",        description: "Raises an issue but without urgency or alarm" },
      { value: 3, label: "Noticeable tension",  description: "Creates unease — reader is meant to feel something is at stake" },
      { value: 4, label: "Fear-activating",     description: "Deliberately builds fear or anxiety about a situation or group" },
      { value: 5, label: "Hostility-inducing",  description: "Content likely to produce anger or fear toward a person or group" },
    ],
  },
  group_conflict: {
    label: "Group Conflict",
    question: "Does this article frame groups in opposition to each other?",
    options: [
      { value: 1, label: "No group framing",   description: "No us-vs-them dynamic — groups not positioned against each other" },
      { value: 2, label: "Mild distinction",   description: "Groups mentioned but not in direct opposition" },
      { value: 3, label: "Noticeable division",description: "In-group and out-group implied — some groups favoured over others" },
      { value: 4, label: "Strong opposition",  description: "Clear adversarial framing between groups throughout" },
      { value: 5, label: "Us vs Them",         description: "Article constructs a clear threat from one group to another" },
    ],
  },
}

const TOPICS = [
  "Politics", "Foreign Policy", "Crime", "Social Issues", "Economy",
  "Judiciary", "Business", "Environment", "Defence", "Entertainment",
  "Sports", "Health", "Technology",
]

const PUBLISHERS = [
  "Indian Express", "NDTV", "Times of India", "The Quint", "News18",
  "Scroll.in", "India TV News", "The Hindu", "National Herald", "OpIndia",
  "DW Asia", "BBC India", "Swarajya Mag", "India Today", "Al Jazeera",
]

// ─── Verdict Card ─────────────────────────────────────────────────────────────

function VerdictCard({
  metricKey,
  onAnswer,
  onSkip,
  cardIndex,
  totalCards,
}: {
  metricKey: string
  onAnswer: (metric: string, value: number) => void
  onSkip: (metric: string) => void
  cardIndex: number
  totalCards: number
}) {
  const meta = METRIC_META[metricKey]
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalCards }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < cardIndex ? "bg-primary" : i === cardIndex ? "bg-primary/40" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Label + question */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Signal {cardIndex + 1} of {totalCards} · {meta.label}
        </p>
        <h3 className="text-base font-semibold text-foreground">{meta.question}</h3>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {meta.options.map((opt) => {
          const isSelected = selected === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setSelected(opt.value)}
              className={`w-full text-left rounded-lg px-4 py-3 border transition-all ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onSkip(metricKey)} className="gap-1.5">
          <SkipForward className="h-3.5 w-3.5" />
          Skip signal
        </Button>
        <Button
          size="sm"
          onClick={() => { if (selected != null) onAnswer(metricKey, selected) }}
          disabled={selected == null}
          className="flex-1 gap-1.5"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {cardIndex + 1 === totalCards ? "Review complete" : "Next signal"}
        </Button>
      </div>
    </div>
  )
}

// ─── Integrity Check ──────────────────────────────────────────────────────────

// Plain-English explanation of each integrity metric and how to read the score
const INTEGRITY_META: Record<string, {
  label: string
  explanation: string
  scoreToText: (score: number) => string
  question: string
}> = {
  context: {
    label: "Contextual sourcing",
    explanation: "This measures whether the article provides background context and cites independent sources — not just official statements or a single perspective. A high score means the article drew on multiple sources and gave you the information needed to understand the story fully.",
    scoreToText: (s) => {
      if (s >= 0.75) return "The AI found strong contextual sourcing — multiple independent sources and good background."
      if (s >= 0.45) return "The AI found moderate context — some sourcing, but background or independent voices may be limited."
      if (s >= 0.2)  return "The AI found weak context — mostly official statements or a single perspective."
      return "The AI found very little context — the article appears to lack independent sourcing or background."
    },
    question: "Based on your reading, does this match how well-sourced and contextualised the article felt?",
  },
  headline: {
    label: "Headline accuracy",
    explanation: "This checks whether the headline accurately reflects what the article actually says. A low score means the headline may be exaggerated, misleading, or not supported by the body of the article.",
    scoreToText: (s) => {
      if (s >= 0.75) return "The AI found the headline closely matches the article's content."
      if (s >= 0.45) return "The AI found the headline broadly matches, but may slightly overstate or understate the article."
      if (s >= 0.2)  return "The AI found a notable gap between the headline and what the article actually says."
      return "The AI found the headline significantly misrepresents the article's content."
    },
    question: "Does this match how well the headline represented the story as you read it?",
  },
  fact: {
    label: "Fact ratio",
    explanation: "This estimates what proportion of the article consists of verifiable facts, as opposed to opinions, speculation, or unattributed claims. It does not check whether the facts are correct — only whether claims are presented as verifiable.",
    scoreToText: (s) => {
      if (s >= 0.75) return "The AI found the article is mostly factual — claims appear verifiable and well-attributed."
      if (s >= 0.45) return "The AI found a mix of facts and opinion — some claims are attributed, others are not."
      if (s >= 0.2)  return "The AI found the article leans toward opinion or unverified claims."
      return "The AI found very few verifiable facts — the article appears to be mostly opinion or unattributed assertions."
    },
    question: "Does this match your sense of how factual vs opinion-based the article was?",
  },
  vulnerable: {
    label: "Vulnerable group risk",
    explanation: "This checks whether the article contains language that could harm, stigmatise, or incite hostility toward marginalised groups — such as religious minorities, ethnic communities, LGBTQ+ people, migrants, or people with disabilities. A low score means the AI detected little or no such content.",
    scoreToText: (s) => {
      if (s >= 0.75) return "The AI detected significant content that could stigmatise or incite hostility toward a marginalised group."
      if (s >= 0.45) return "The AI detected some language that could be harmful to a marginalised group."
      if (s >= 0.2)  return "The AI detected minimal risk — a small amount of potentially harmful framing."
      return "The AI detected no content that could harm or stigmatise marginalised groups."
    },
    question: "Does this match your reading? Did the article contain language that felt harmful or stigmatising toward any group?",
  },
}

function IntegrityCheck({
  validation,
  onComplete,
}: {
  validation: any
  onComplete: (agreed: boolean | null, note: string) => void
}) {
  const [decision, setDecision] = useState<boolean | null>(null)
  const [note, setNote] = useState("")

  const meta = INTEGRITY_META[validation.metric]

  // Fallback if metric is unrecognised
  if (!meta) {
    return (
      <div className="rounded-lg border bg-muted/30 p-5 space-y-3">
        <p className="text-sm text-muted-foreground">
          AI scored this article {(validation.score * 100).toFixed(0)}% on {validation.metric}.
        </p>
        <div className="flex gap-2">
          <Button variant={decision === true ? "default" : "outline"} size="sm" onClick={() => setDecision(true)}>Agree</Button>
          <Button variant={decision === false ? "destructive" : "outline"} size="sm" onClick={() => setDecision(false)}>Disagree</Button>
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => onComplete(null, "")}>Skip</Button>
        </div>
        {decision !== null && (
          <Button size="sm" className="w-full" onClick={() => onComplete(decision, note)}>Confirm</Button>
        )}
      </div>
    )
  }

  const scoreText = meta.scoreToText(validation.score)

  return (
    <div className="rounded-lg border bg-muted/30 p-5 space-y-4">

      {/* Header */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          AI Integrity Check · {meta.label}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {meta.explanation}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* What the AI found */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          What the AI found
        </p>
        <p className="text-sm text-foreground">{scoreText}</p>
        {validation.note && (
          <p className="text-xs text-muted-foreground mt-1 italic">"{validation.note}"</p>
        )}
      </div>

      {/* Question */}
      <p className="text-sm font-medium text-foreground">{meta.question}</p>

      {/* Agree / Disagree */}
      <div className="flex gap-2">
        <Button
          variant={decision === true ? "default" : "outline"}
          size="sm"
          onClick={() => setDecision(true)}
        >
          Yes, that matches
        </Button>
        <Button
          variant={decision === false ? "destructive" : "outline"}
          size="sm"
          onClick={() => setDecision(false)}
        >
          No, I disagree
        </Button>
        <Button
          variant="ghost" size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => onComplete(null, "")}
        >
          Skip
        </Button>
      </div>

      {decision === false && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did the AI miss or get wrong? (optional)"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={2}
        />
      )}

      {decision !== null && (
        <Button size="sm" className="w-full" onClick={() => onComplete(decision, note)}>
          Confirm
        </Button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReviewerHubPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()

  // Get suggested article ID if coming from ArticleDetailPage
  const suggestedArticleId = (location.state as any)?.suggestedArticleId ?? null

  const [mode, setMode]           = useState<Mode>("dashboard")
  const [analytics, setAnalytics] = useState<any>(null)
  const [dashLoading, setDashLoading] = useState(true)

  const [selectedLens, setSelectedLens]         = useState<FilterLens | null>(null)
  const [selectedTopic, setSelectedTopic]       = useState<string | null>(null)
  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null)
  const [assignedMetrics, setAssignedMetrics]   = useState<[string, string] | null>(null)
  const [metricsLoading, setMetricsLoading]     = useState(false)

  const [queue, setQueue]               = useState<ReviewQueueItemV2[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cardIndex, setCardIndex]       = useState(0)
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, number>>({})
  const [sessionSkipped, setSessionSkipped] = useState<string[]>([])
  const [integrityDone, setIntegrityDone]   = useState(false)
  const [integrityResult, setIntegrityResult] = useState<{ agreed: boolean | null; note: string } | null>(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [submitting, setSubmitting]     = useState(false)
  const [comment, setComment]           = useState("")
  const [loggingOut, setLoggingOut]         = useState(false)
  const [changingFocus, setChangingFocus]   = useState(false)
  const [pendingLens, setPendingLens]       = useState<FilterLens | null>(null)
  const [pendingTopic, setPendingTopic]     = useState<string | null>(null)
  const [pendingPublisher, setPendingPublisher] = useState<string | null>(null)
  const [refetchingQueue, setRefetchingQueue]   = useState(false)

  const currentItem    = queue[currentIndex] ?? null
  const sessionMetrics = assignedMetrics ?? ["political", "intensity"]

  useEffect(() => {
    if (authLoading) return
    if (!user) { navigate("/login"); return }
    async function load() {
      try {
        const data = await getReviewerAnalytics()
        setAnalytics(data ?? {
          reviewed: 0, total: 0, streak: 0,
          avgPolitical: 0, avgIntensity: 0, avgThreat: 0,
          avgSensationalism: 0, avgGroupConflict: 0,
          publishers: [], dominantType: "New reviewer",
          ideologyBias: "No pattern detected",
        })
      } catch { setAnalytics(null) }
      finally  { setDashLoading(false) }
    }
    load()
  }, [user, authLoading, navigate])

  // If user came from article detail with a suggested article, auto-load setup
  useEffect(() => {
    if (suggestedArticleId && mode === "dashboard" && !dashLoading) {
      setMode("setup")
      setSelectedLens("random")
    }
  }, [suggestedArticleId, mode, dashLoading])

  async function handleLensSelect(lens: FilterLens) {
    setSelectedLens(lens)
    setMetricsLoading(true)
    try {
      const metrics = await assignSessionMetrics()
      setAssignedMetrics(metrics)
    } catch { setAssignedMetrics(["political", "intensity"]) }
    finally  { setMetricsLoading(false) }
  }

  async function handleStartSession() {
    if (!user || !assignedMetrics) return
    setQueueLoading(true)
    try {
      const filters: any = {}
      if (selectedLens === "topic"     && selectedTopic)     filters.topic     = selectedTopic
      if (selectedLens === "publisher" && selectedPublisher) filters.publisher = selectedPublisher
      const q = await getFilteredReviewQueue(user.id, filters, assignedMetrics)
      if (!q || q.length === 0) {
        toast.error("No articles found — try a different filter")
        return
      }

      // If there's a suggested article, try to find it in the queue and start from there
      let startIndex = 0
      if (suggestedArticleId) {
        const foundIndex = q.findIndex(item => String(item.article.id) === String(suggestedArticleId))
        if (foundIndex !== -1) {
          startIndex = foundIndex
          toast.info("Found your article in the queue!")
        }
      }

      setQueue(q); setCurrentIndex(startIndex); setCardIndex(0)
      setSessionAnswers({}); setSessionSkipped([])
      setIntegrityDone(false); setIntegrityResult(null)
      setComment(""); setSessionCount(0)
      setMode("review")
    } catch { toast.error("Failed to load review queue") }
    finally  { setQueueLoading(false) }
  }

  function handleAnswer(metric: string, value: number) {
    setSessionAnswers((prev) => ({ ...prev, [metric]: value }))
    const next = cardIndex + 1
    setCardIndex(next < sessionMetrics.length ? next : sessionMetrics.length)
  }

  function handleSkipCard(metric: string) {
    setSessionSkipped((prev) => [...prev, metric])
    handleAnswer(metric, -1)
  }

  async function handleSubmitArticle(integrityOverride?: { agreed: boolean | null; note: string }) {
    if (!currentItem || !user || submitting) return
    setSubmitting(true)
    try {
      const answeredMetrics: Record<string, number> = {}
      Object.entries(sessionAnswers).forEach(([k, v]) => { if (v !== -1) answeredMetrics[k] = v })
      const ip = integrityOverride ?? integrityResult
      await submitReviewV2({
        article_id:    String(currentItem.article.id),
        reviewer_id:   user.id,
        answeredMetrics,
        skippedMetrics: sessionSkipped,
        shownMetrics:   sessionMetrics,
        integrity:      currentItem.validation && ip
          ? { metric: currentItem.validation.metric, ...ip }
          : null,
        highlight: comment || null,
      })
      setSessionCount((c) => c + 1)
      toast.success("Review saved")
      advanceToNext()
    } catch { toast.error("Failed to save review") }
    finally  { setSubmitting(false) }
  }

  function advanceToNext() {
    const next = currentIndex + 1
    if (next >= queue.length) { toast.info("Queue complete — great work!"); setMode("dashboard"); return }
    setCurrentIndex(next); setCardIndex(0)
    setSessionAnswers({}); setSessionSkipped([])
    setIntegrityDone(false); setIntegrityResult(null); setComment("")
  }

  function handleIntegrityComplete(agreed: boolean | null, note: string) {
    const result = { agreed, note }
    setIntegrityResult(result); setIntegrityDone(true)
    handleSubmitArticle(result)
  }

  async function handleApplyFocusChange() {
    if (!user || !pendingLens || !assignedMetrics) return
    setRefetchingQueue(true)
    try {
      const filters: any = {}
      if (pendingLens === "topic"     && pendingTopic)     filters.topic     = pendingTopic
      if (pendingLens === "publisher" && pendingPublisher) filters.publisher = pendingPublisher
      const q = await getFilteredReviewQueue(user.id, filters, assignedMetrics)
      if (!q || q.length === 0) {
        toast.error("No articles found for this selection — try something else")
        return
      }
      setSelectedLens(pendingLens)
      setSelectedTopic(pendingTopic)
      setSelectedPublisher(pendingPublisher)
      setQueue(q)
      setCurrentIndex(0)
      setCardIndex(0)
      setSessionAnswers({})
      setSessionSkipped([])
      setIntegrityDone(false)
      setIntegrityResult(null)
      setComment("")
      setChangingFocus(false)
      toast.success("Focus updated")
    } catch {
      toast.error("Failed to reload queue")
    } finally {
      setRefetchingQueue(false)
    }
  }

  function focusLabel(): string {
    if (selectedLens === "topic"     && selectedTopic)     return selectedTopic
    if (selectedLens === "publisher" && selectedPublisher) return selectedPublisher
    if (selectedLens === "cluster")                        return "Story cluster"
    return "All articles"
  }

  const cardsComplete = cardIndex >= sessionMetrics.length
  const hasIntegrity  = !!currentItem?.validation
  const showIntegrity = cardsComplete && hasIntegrity && !integrityDone
  const showSubmit    = cardsComplete && (!hasIntegrity || integrityDone)

  if (authLoading || dashLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  //  DASHBOARD
  // ══════════════════════════════════════════════════════════

  if (mode === "dashboard") {
    const progress = analytics?.total ? (analytics.reviewed / analytics.total) * 100 : 0
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reviewer Hub</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your perceptual profile across {analytics?.reviewed ?? 0} reviews
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setMode("setup")} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              Start Session
            </Button>
            <Button variant="outline" size="icon" onClick={async () => { setLoggingOut(true); await signOut(); navigate("/login") }} disabled={loggingOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Reviews",          value: analytics?.reviewed ?? 0 },
            { label: "Day streak",       value: `${analytics?.streak ?? 0} days`, icon: <Flame className="h-3.5 w-3.5 text-orange-500" /> },
            { label: "Corpus coverage",  value: `${progress.toFixed(1)}%` },
            { label: "Reviewer type",    value: analytics?.dominantType ?? "—" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-lg border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
              <p className="text-xl font-bold text-foreground truncate">{value}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div className="rounded-lg border bg-card p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Corpus coverage</span>
            <span className="text-muted-foreground">{analytics?.reviewed ?? 0} / {analytics?.total ?? 0} articles</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Target: 2,000–3,000 reviews per metric for statistical reliability
          </p>
        </div>

        {/* Signal sensitivity */}
        {analytics && (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">Your Signal Sensitivity</h2>
            {[
              { key: "avgIntensity",      label: "Emotional intensity" },
              { key: "avgThreat",         label: "Threat signal" },
              { key: "avgSensationalism", label: "Sensationalism" },
              { key: "avgPolitical",      label: "Ideological framing" },
            ].map(({ key, label }) => {
              const val = analytics[key] ?? 0
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">{val.toFixed(2)} / 5</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(val / 5) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  //  SETUP
  // ══════════════════════════════════════════════════════════

  if (mode === "setup") {
    const lensOptions = [
      { key: "topic"     as FilterLens, icon: <Tag className="h-4 w-4" />,       label: "By topic",     desc: "Focus on a subject area you know well" },
      { key: "publisher" as FilterLens, icon: <Building2 className="h-4 w-4" />, label: "By publisher", desc: "Review articles from a specific outlet" },
      { key: "cluster"   as FilterLens, icon: <Layers className="h-4 w-4" />,    label: "By story",     desc: "Go deep on a single news cluster" },
      { key: "random"    as FilterLens, icon: <Shuffle className="h-4 w-4" />,   label: "Surprise me",  desc: "Highest-priority articles across the corpus" },
    ]
    const canStart =
      selectedLens !== null &&
      (selectedLens === "random" || selectedLens === "cluster" ||
        (selectedLens === "topic" && selectedTopic) ||
        (selectedLens === "publisher" && selectedPublisher)) &&
      assignedMetrics !== null && !metricsLoading

    return (
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">

        <div className="flex items-center gap-3">
          <button onClick={() => setMode("dashboard")} className="text-muted-foreground hover:text-foreground transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Start a Session</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose your focus — you'll be assigned two signals to rate
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">What would you like to review?</p>
          <div className="grid grid-cols-2 gap-3">
            {lensOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleLensSelect(opt.key)}
                className={`rounded-lg border p-4 text-left transition-all ${
                  selectedLens === opt.key
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                  {opt.icon}
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedLens === "topic" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Select a topic</p>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTopic(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    selectedTopic === t
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedLens === "publisher" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Select a publisher</p>
            <div className="flex flex-wrap gap-2">
              {PUBLISHERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPublisher(p)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    selectedPublisher === p
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {metricsLoading && (
          <p className="text-sm text-muted-foreground animate-pulse">
            Assigning signals based on corpus gaps...
          </p>
        )}

        {assignedMetrics && !metricsLoading && (
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <p className="text-sm font-medium">Your signals for this session</p>
            <div className="space-y-3">
              {assignedMetrics.map((m) => {
                const meta = METRIC_META[m]
                return (
                  <div key={m} className="flex items-start gap-3">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{meta.question}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Assigned based on which signals have the least coverage across the corpus right now.
            </p>
          </div>
        )}

        <Button onClick={handleStartSession} disabled={!canStart || queueLoading} className="w-full gap-2" size="lg">
          {queueLoading ? "Loading queue..." : <><span>Begin Session</span><ChevronRight className="h-4 w-4" /></>}
        </Button>

      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  //  REVIEW
  // ══════════════════════════════════════════════════════════

  if (!currentItem) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
          <p className="font-medium">Queue complete</p>
          <p className="text-sm text-muted-foreground">
            {sessionCount} article{sessionCount !== 1 ? "s" : ""} reviewed this session
          </p>
          <Button variant="outline" onClick={() => setMode("dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  const { article, validation, missingMetrics } = currentItem

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">

      {/* Session bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode("dashboard")} className="text-muted-foreground hover:text-foreground transition">
              <X className="h-4 w-4" />
            </button>
            <p className="text-sm text-muted-foreground">
              {sessionCount} reviewed · {queue.length - currentIndex} remaining
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Current focus label + change button */}
            <span className="text-xs text-muted-foreground">
              Focus: <span className="font-medium text-foreground">{focusLabel()}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                setPendingLens(selectedLens)
                setPendingTopic(selectedTopic)
                setPendingPublisher(selectedPublisher)
                setChangingFocus((v) => !v)
              }}
            >
              <SlidersHorizontal className="h-3 w-3" />
              Change focus
            </Button>
            {sessionMetrics.map((m) => (
              <span key={m} className="px-2.5 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground">
                {METRIC_META[m].label}
              </span>
            ))}
          </div>
        </div>

        {/* Inline focus-change panel */}
        {changingFocus && (
          <div className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Change your focus</p>
              <button
                onClick={() => setChangingFocus(false)}
                className="text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lens options */}
            <div className="grid grid-cols-4 gap-2">
              {([
                { key: "topic"     as FilterLens, icon: <Tag className="h-3.5 w-3.5" />,       label: "By topic"     },
                { key: "publisher" as FilterLens, icon: <Building2 className="h-3.5 w-3.5" />, label: "By publisher" },
                { key: "cluster"   as FilterLens, icon: <Layers className="h-3.5 w-3.5" />,    label: "By story"     },
                { key: "random"    as FilterLens, icon: <Shuffle className="h-3.5 w-3.5" />,   label: "All articles" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setPendingLens(opt.key); setPendingTopic(null); setPendingPublisher(null) }}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    pendingLens === opt.key
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">{opt.icon}</div>
                  <p className="text-xs font-medium text-foreground">{opt.label}</p>
                </button>
              ))}
            </div>

            {/* Topic picker */}
            {pendingLens === "topic" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select a topic</p>
                <div className="flex flex-wrap gap-1.5">
                  {TOPICS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setPendingTopic(t)}
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${
                        pendingTopic === t
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Publisher picker */}
            {pendingLens === "publisher" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select a publisher</p>
                <div className="flex flex-wrap gap-1.5">
                  {PUBLISHERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPendingPublisher(p)}
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${
                        pendingPublisher === p
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Apply */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setChangingFocus(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={
                  !pendingLens ||
                  refetchingQueue ||
                  (pendingLens === "topic" && !pendingTopic) ||
                  (pendingLens === "publisher" && !pendingPublisher)
                }
                onClick={handleApplyFocusChange}
                className="gap-1.5"
              >
                {refetchingQueue ? "Loading..." : "Apply"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">

        {/* Article panel */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b">
              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />{article.publisher}
                </span>
                {article.topic && <><span>·</span><span>{article.topic}</span></>}
                {missingMetrics.length > 0 && (
                  <><span>·</span>
                  <span className="text-amber-600">
                    {missingMetrics.length} signal{missingMetrics.length !== 1 ? "s" : ""} missing globally
                  </span></>
                )}
              </div>
              <h2 className="text-lg font-semibold leading-snug">{article.headline}</h2>
            </div>
            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {article.content}
              </p>
            </div>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional observation about this article..."
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />

          <button
            onClick={() => { toast.info("Article skipped"); advanceToNext() }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Skip this article
          </button>
        </div>

        {/* Signal panel */}
        <div className="rounded-lg border bg-card p-6">

          {!cardsComplete && (
            <VerdictCard
              key={`${currentIndex}-${sessionMetrics[cardIndex]}`}
              metricKey={sessionMetrics[cardIndex]}
              onAnswer={handleAnswer}
              onSkip={handleSkipCard}
              cardIndex={cardIndex}
              totalCards={sessionMetrics.length}
            />
          )}

          {showIntegrity && (
            <div className="space-y-3">
              <p className="text-sm font-medium">One more thing</p>
              <IntegrityCheck validation={validation} onComplete={handleIntegrityComplete} />
            </div>
          )}

          {showSubmit && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Review summary</p>
              <div className="space-y-2">
                {sessionMetrics.map((m) => {
                  const meta    = METRIC_META[m]
                  const val     = sessionAnswers[m]
                  const skipped = sessionSkipped.includes(m)
                  const option  = meta.options.find((o) => o.value === val)
                  return (
                    <div key={m} className="flex items-center justify-between rounded-md border px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">{meta.label}</span>
                      {skipped
                        ? <span className="text-xs text-muted-foreground">skipped</span>
                        : <span className="font-medium">{option?.label ?? "—"}</span>
                      }
                    </div>
                  )
                })}
              </div>
              <Button onClick={() => handleSubmitArticle()} disabled={submitting} className="w-full gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Saving..." : "Submit & next article"}
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
