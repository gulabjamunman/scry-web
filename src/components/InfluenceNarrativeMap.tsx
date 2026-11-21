import { useState, Fragment } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { Article, FactHighlight, VulnerableSpan } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type SpanType = "claim" | "vulnerable"

interface ActiveSpan {
  text: string
  type: SpanType
  claimType?: "verifiable" | "unverified" | "speculative"
  reason?: string
  impact?: string
  risk?: string
}

// ─── Claim label + styling ────────────────────────────────────────────────────

// For new records: use claim_type directly.
// For old records (no claim_type): infer from reason text as fallback.
function inferClaimLabel(reason?: string): "verifiable" | "unverified" | "speculative" {
  if (!reason) return "unverified"
  const r = reason.toLowerCase()
  const verifiableSignals = [
    "verifiable", "factual", "clearly identified", "specific", "date and",
    "party clearly", "named", "supports epistemic", "corroborat",
  ]
  const unverifiedSignals = [
    "no source", "no evidence", "unverified", "vague", "unconfirmed",
    "no independent", "not verified", "no data", "no citation",
    "without evidence", "not corroborat",
  ]
  if (verifiableSignals.some((s) => r.includes(s)) && !unverifiedSignals.some((s) => r.includes(s)))
    return "verifiable"
  if (unverifiedSignals.some((s) => r.includes(s)))
    return "unverified"
  return "unverified"
}

function resolveClaimType(
  claimType?: "verifiable" | "unverified" | "speculative",
  reason?: string
): "verifiable" | "unverified" | "speculative" {
  if (claimType) return claimType
  return inferClaimLabel(reason)
}

const CLAIM_META = {
  verifiable: {
    label:      "Verifiable claim",
    headerBg:   "bg-green-50 dark:bg-green-950/30",
    border:     "border-green-200 dark:border-green-800/60",
    labelColor: "text-green-700 dark:text-green-400",
    highlight:  "bg-green-100/70 border-b-2 border-green-400 dark:bg-green-900/25 dark:border-green-600 hover:bg-green-200/70 dark:hover:bg-green-900/40",
    ring:       "ring-green-400 dark:ring-green-500",
    sectionLabel: "Why it's verifiable",
  },
  unverified: {
    label:      "Unverified claim",
    headerBg:   "bg-amber-50 dark:bg-amber-950/30",
    border:     "border-amber-200 dark:border-amber-800/60",
    labelColor: "text-amber-700 dark:text-amber-400",
    highlight:  "bg-amber-100/80 border-b-2 border-amber-400 dark:bg-amber-900/30 dark:border-amber-500 hover:bg-amber-200/80 dark:hover:bg-amber-900/50",
    ring:       "ring-amber-400 dark:ring-amber-500",
    sectionLabel: "Why it's questionable",
  },
  speculative: {
    label:      "Speculative claim",
    headerBg:   "bg-purple-50 dark:bg-purple-950/30",
    border:     "border-purple-200 dark:border-purple-800/60",
    labelColor: "text-purple-700 dark:text-purple-400",
    highlight:  "bg-purple-100/70 border-b-2 border-purple-400 dark:bg-purple-900/25 dark:border-purple-500 hover:bg-purple-200/70 dark:hover:bg-purple-900/40",
    ring:       "ring-purple-400 dark:ring-purple-500",
    sectionLabel: "Why it's speculative",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function framingMeta(score: number) {
  if (score > 0.5)  return { label: "Strongly right-leaning", pill: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300" }
  if (score > 0.2)  return { label: "Mildly right-leaning",   pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" }
  if (score < -0.5) return { label: "Strongly left-leaning",  pill: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300" }
  if (score < -0.2) return { label: "Mildly left-leaning",    pill: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300" }
  return                   { label: "Centrist / neutral",     pill: "bg-muted text-muted-foreground" }
}

function intensityMeta(score: number) {
  if (score > 0.6) return { label: "Highly charged",   pill: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" }
  if (score > 0.3) return { label: "Moderately toned", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" }
  return                  { label: "Calm and factual", pill: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" }
}

function contextMeta(score: number) {
  if (score > 0.7) return { label: "Well contextualised",      color: "text-green-600 dark:text-green-400" }
  if (score > 0.4) return { label: "Partially contextualised", color: "text-amber-600 dark:text-amber-400" }
  return                  { label: "Context thin",             color: "text-red-500 dark:text-red-400" }
}

function parseAnalysis(text: string, keys: string[]) {
  if (!text) return []
  const result: { title: string; content: string }[] = []
  for (let i = 0; i < keys.length; i++) {
    const start = text.indexOf(keys[i])
    if (start === -1) continue
    const after = start + keys[i].length
    const nextIdx = keys
      .slice(i + 1)
      .map((k) => text.indexOf(k))
      .filter((n) => n > start)
    const end = nextIdx.length ? Math.min(...nextIdx) : text.length
    const content = text.slice(after, end).trim()
    if (content) result.push({ title: keys[i], content })
  }
  return result
}

const BIAS_KEYS = [
  "FRAMING",
  "LANGUAGE INTENSITY",
  "SENSATIONALISM",
  "OVERALL INTERPRETATION",
]

const BEHAVIOUR_KEYS = [
  "ATTENTION AND SALIENCE",
  "ATTENTION & SALIENCE",
  "EMOTIONAL TRIGGERS",
  "SOCIAL AND IDENTITY CUES",
  "SOCIAL & IDENTITY CUES",
  "MOTIVATION AND ACTION SIGNALS",
  "MOTIVATION & ACTION SIGNALS",
  "OVERALL BEHAVIOURAL INTERPRETATION",
]

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({
  label,
  value,
  barClass = "bg-primary",
}: {
  label: string
  value: number | null | undefined
  barClass?: string
}) {
  const pctVal = Math.round((value ?? 0) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums text-foreground">{pctVal}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
    </div>
  )
}

// ─── Expandable Panel Section ─────────────────────────────────────────────────

function Expandable({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-left group"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
          {title}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </button>
      {open && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  )
}

// ─── Analysis Text Renderer ───────────────────────────────────────────────────

function AnalysisSection({
  sections,
}: {
  sections: { title: string; content: string }[]
}) {
  return (
    <div className="space-y-4">
      {sections.map((s, i) => (
        <div key={i}>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {s.title}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {s.content}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Inline Span Card ─────────────────────────────────────────────────────────

function InlineSpanCard({
  span,
  onClose,
}: {
  span: ActiveSpan
  onClose: () => void
}) {
  const isClaim = span.type === "claim"

  if (!isClaim) {
    return (
      <div
        className="rounded-xl border overflow-hidden text-sm my-2 border-red-200 dark:border-red-800/60"
        style={{ animation: "inlineCardIn 0.15s ease" }}
      >
        <div className="px-4 py-3 flex items-start justify-between gap-3 bg-red-50 dark:bg-red-950/30">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
              Vulnerable group risk
            </p>
            <p className="font-medium text-foreground leading-snug">"{span.text}"</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition shrink-0 text-xs pt-0.5" aria-label="Close">✕</button>
        </div>
        {span.risk && (
          <div className="px-4 py-3 bg-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Risk explanation</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{span.risk}</p>
          </div>
        )}
      </div>
    )
  }

  const ct   = resolveClaimType(span.claimType, span.reason)
  const meta = CLAIM_META[ct]

  return (
    <div
      className={`rounded-xl border overflow-hidden text-sm my-2 ${meta.border}`}
      style={{ animation: "inlineCardIn 0.15s ease" }}
    >
      <div className={`px-4 py-3 flex items-start justify-between gap-3 ${meta.headerBg}`}>
        <div className="space-y-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${meta.labelColor}`}>
            {meta.label}
          </p>
          <p className="font-medium text-foreground leading-snug">"{span.text}"</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition shrink-0 text-xs pt-0.5" aria-label="Close">✕</button>
      </div>

      <div className="divide-y divide-border">
        {span.reason && (
          <div className="px-4 py-3 bg-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              {meta.sectionLabel}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{span.reason}</p>
          </div>
        )}
        {span.impact && (
          <div className="px-4 py-3 bg-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Effect on reader
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{span.impact}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Annotated Article Text ───────────────────────────────────────────────────

function AnnotatedArticle({
  content,
  factHighlights,
  vulnerableSpans,
  activeSpan,
  onSpanClick,
}: {
  content: string
  factHighlights: FactHighlight[]
  vulnerableSpans: VulnerableSpan[]
  activeSpan: ActiveSpan | null
  onSpanClick: (span: ActiveSpan | null) => void
}) {
  type Annotation = {
    type: SpanType
    claimType?: "verifiable" | "unverified" | "speculative"
    reason?: string
    impact?: string
    risk?: string
  }

  const map = new Map<string, Annotation>()
  factHighlights.forEach((f) => {
    if (f.text) map.set(f.text, {
      type:      "claim",
      claimType: f.claim_type,
      reason:    f.reason,
      impact:    f.impact,
    })
  })
  vulnerableSpans.forEach((v) => {
    if (v.text) map.set(v.text, { type: "vulnerable", risk: v.risk_explanation })
  })

  type Part = { text: string; annotation?: Annotation }
  const parts: Part[] = []

  if (!map.size) {
    parts.push({ text: content })
  } else {
    let remaining = content
    while (remaining.length > 0) {
      let earliest = -1
      let earliestKey = ""
      map.forEach((_, key) => {
        const idx = remaining.indexOf(key)
        if (idx !== -1 && (earliest === -1 || idx < earliest)) {
          earliest = idx
          earliestKey = key
        }
      })
      if (earliest === -1) { parts.push({ text: remaining }); break }
      if (earliest > 0) parts.push({ text: remaining.slice(0, earliest) })
      parts.push({ text: earliestKey, annotation: map.get(earliestKey) })
      remaining = remaining.slice(earliest + earliestKey.length)
    }
  }

  // Split into paragraphs
  type ParaPart = Part
  const paragraphs: ParaPart[][] = [[]]
  for (const part of parts) {
    if (part.annotation) {
      paragraphs[paragraphs.length - 1].push(part)
    } else {
      const lines = part.text.split("\n")
      paragraphs[paragraphs.length - 1].push({ text: lines[0] })
      for (let i = 1; i < lines.length; i++) paragraphs.push([{ text: lines[i] }])
    }
  }

  const visibleParagraphs = paragraphs.filter((p) =>
    p.some((part) => part.text.trim() || part.annotation)
  )

  return (
    <>
      <style>{`
        @keyframes inlineCardIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {visibleParagraphs.map((para, pIdx) => {
        const activeInPara = para.find(
          (part) => part.annotation && part.text === activeSpan?.text
        )
        const activeEntry: ActiveSpan | null = activeInPara
          ? {
              text:      activeInPara.text,
              type:      activeInPara.annotation!.type,
              claimType: activeInPara.annotation!.claimType,
              reason:    activeInPara.annotation!.reason,
              impact:    activeInPara.annotation!.impact,
              risk:      activeInPara.annotation!.risk,
            }
          : null

        return (
          <Fragment key={pIdx}>
            <p className="text-sm leading-[1.9] text-foreground" style={{ margin: "0 0 0.4em" }}>
              {para.map((part, sIdx) => {
                if (!part.annotation) return <span key={sIdx}>{part.text}</span>

                const isActive  = activeSpan?.text === part.text
                const isVuln    = part.annotation.type === "vulnerable"

                // Determine highlight classes
                let highlightClass: string
                if (isVuln) {
                  highlightClass = "bg-red-100/70 border-b-2 border-red-400 dark:bg-red-900/30 dark:border-red-500 hover:bg-red-200/70 dark:hover:bg-red-900/50"
                } else {
                  const ct = resolveClaimType(part.annotation.claimType, part.annotation.reason)
                  highlightClass = CLAIM_META[ct].highlight
                }

                const ringClass = isVuln
                  ? "ring-red-400 dark:ring-red-500"
                  : CLAIM_META[resolveClaimType(part.annotation.claimType, part.annotation.reason)].ring

                return (
                  <button
                    key={sIdx}
                    onClick={() =>
                      isActive
                        ? onSpanClick(null)
                        : onSpanClick({
                            text:      part.text,
                            type:      part.annotation!.type,
                            claimType: part.annotation!.claimType,
                            reason:    part.annotation!.reason,
                            impact:    part.annotation!.impact,
                            risk:      part.annotation!.risk,
                          })
                    }
                    className={[
                      "rounded-[3px] px-0.5 -mx-0.5 cursor-pointer transition-all duration-150 text-left align-baseline",
                      highlightClass,
                      isActive ? `ring-2 ring-offset-1 ${ringClass}` : "",
                    ].join(" ")}
                  >
                    {part.text}
                  </button>
                )
              })}
            </p>

            {activeEntry && (
              <InlineSpanCard span={activeEntry} onClose={() => onSpanClick(null)} />
            )}
          </Fragment>
        )
      })}
    </>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function InfluenceNarrativeMap({ article }: { article: Article }) {
  const [activeSpan, setActiveSpan] = useState<ActiveSpan | null>(null)

  const factHighlights: FactHighlight[] = Array.isArray(article.aiFactHighlights)
    ? (article.aiFactHighlights as FactHighlight[])
    : []
  const vulnerableSpans: VulnerableSpan[] = Array.isArray(article.aiVulnerableSpans)
    ? (article.aiVulnerableSpans as VulnerableSpan[])
    : []

  const hasAnnotations = factHighlights.length > 0 || vulnerableSpans.length > 0

  const framingScore   = article.aiFramingDirection  ?? article.politicalLeaning  ?? 0
  const intensityScore = article.aiLanguageIntensity ?? article.emotionalIntensity ?? 0

  const framing   = framingMeta(framingScore)
  const intensity = intensityMeta(intensityScore)
  const context   = contextMeta(article.aiContextScore ?? 0)

  const framingPct = Math.round(((framingScore + 1) / 2) * 100)

  const biasSections      = parseAnalysis(article.biasExplanation     ?? "", BIAS_KEYS)
  const behaviourSections = parseAnalysis(article.behaviouralAnalysis ?? "", BEHAVIOUR_KEYS)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-card-foreground">
            Influence &amp; Narrative Map
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasAnnotations
              ? `${factHighlights.length} flagged claim${factHighlights.length !== 1 ? "s" : ""} · ${vulnerableSpans.length} risk span${vulnerableSpans.length !== 1 ? "s" : ""} — tap highlighted text to explore`
              : "Framing, narrative signals, and epistemic quality"}
          </p>
        </div>

        {hasAnnotations && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800/60">
              <span className="w-2 h-2 rounded-sm bg-green-300 dark:bg-green-600 inline-block" />
              Verifiable
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
              <span className="w-2 h-2 rounded-sm bg-amber-300 dark:bg-amber-600 inline-block" />
              Unverified
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60">
              <span className="w-2 h-2 rounded-sm bg-purple-300 dark:bg-purple-600 inline-block" />
              Speculative
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/60">
              <span className="w-2 h-2 rounded-sm bg-red-300 dark:bg-red-700 inline-block" />
              Risk span
            </span>
          </div>
        )}
      </div>

      {/* Body — split layout */}
      <div className="grid lg:grid-cols-[1fr_360px] divide-y lg:divide-y-0 lg:divide-x divide-border">

        {/* LEFT — annotated article */}
        <div className="px-5 py-5 overflow-y-auto max-h-[700px]">
          {article.content ? (
            <AnnotatedArticle
              content={article.content}
              factHighlights={factHighlights}
              vulnerableSpans={vulnerableSpans}
              activeSpan={activeSpan}
              onSpanClick={setActiveSpan}
            />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Article content not available.
            </p>
          )}
        </div>

        {/* RIGHT — analysis panel */}
        <div className="px-5 py-5 overflow-y-auto max-h-[700px]">

          {/* Impact summary pills */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="rounded-lg bg-muted/50 px-3 py-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">Framing</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${framing.pill}`}>
                {framing.label}
              </span>
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-3 space-y-1.5">
              <p className="text-xs text-muted-foreground">Emotional register</p>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${intensity.pill}`}>
                {intensity.label}
              </span>
            </div>
            <div className="col-span-2 rounded-lg bg-muted/50 px-3 py-3 space-y-1">
              <p className="text-xs text-muted-foreground">Context quality</p>
              <p className={`text-xs font-medium ${context.color}`}>{context.label}</p>
              {article.aiContextNote && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  {article.aiContextNote}
                </p>
              )}
            </div>
          </div>

          {/* Political framing spectrum */}
          <Expandable title="Political framing" defaultOpen>
            <div className="space-y-2 pt-1">
              <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-blue-200 via-muted to-orange-200 dark:from-blue-900/60 dark:via-muted dark:to-orange-900/60">
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow-sm"
                  style={{ left: `calc(${framingPct}% - 6px)` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Left</span>
                <span>Centre</span>
                <span>Right</span>
              </div>
            </div>
          </Expandable>

          {/* Signal scores */}
          <Expandable title="Signal scores" defaultOpen>
            <div className="space-y-3 pt-1">
              <ScoreBar
                label="Language intensity"
                value={article.aiLanguageIntensity ?? article.emotionalIntensity}
                barClass="bg-amber-400 dark:bg-amber-500"
              />
              <ScoreBar
                label="Us vs them"
                value={article.aiUsVsThemScore ?? article.tribalActivation}
                barClass="bg-red-400 dark:bg-red-500"
              />
              <ScoreBar
                label="Threat signal"
                value={article.aiThreatSignal ?? article.threatSignal}
                barClass="bg-red-500 dark:bg-red-600"
              />
              <ScoreBar
                label="Sensationalism"
                value={article.aiSensationalism ?? article.sensationalism}
                barClass="bg-orange-400 dark:bg-orange-500"
              />
              <ScoreBar
                label="Group conflict"
                value={article.groupConflict}
                barClass="bg-red-400 dark:bg-red-500"
              />
            </div>
          </Expandable>

          {/* Narrative integrity */}
          <Expandable title="Narrative integrity">
            <div className="space-y-3 pt-1">
              <ScoreBar
                label="Contextual accuracy"
                value={article.aiContextScore}
                barClass="bg-primary"
              />
              <ScoreBar
                label="Headline alignment"
                value={article.aiHeadlineScore}
                barClass="bg-primary"
              />
              <ScoreBar
                label="Fact density"
                value={article.aiFactRatio}
                barClass="bg-blue-500 dark:bg-blue-400"
              />
              <ScoreBar
                label="Vulnerable group risk"
                value={article.aiVulnerableScore}
                barClass="bg-red-500 dark:bg-red-400"
              />
            </div>
            {article.aiHeadlineNote && (
              <p className="text-xs text-muted-foreground leading-relaxed pt-3 border-t border-border mt-1">
                {article.aiHeadlineNote}
              </p>
            )}
          </Expandable>

          {/* Bias explanation */}
          {biasSections.length > 0 && (
            <Expandable title="Bias explanation">
              <AnalysisSection sections={biasSections} />
            </Expandable>
          )}

          {/* Behavioural analysis */}
          {behaviourSections.length > 0 && (
            <Expandable title="Behavioural analysis">
              <AnalysisSection sections={behaviourSections} />
            </Expandable>
          )}

        </div>
      </div>
    </div>
  )
}
