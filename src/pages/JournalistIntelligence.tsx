import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Users, Search, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, ArrowUpDown,
  Newspaper, Building2, X, Loader, ExternalLink,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ArticleRef {
  id:       string
  headline: string
  url:      string
  date:     string
  framing:  number | null
  topic:    string | null
}

interface JournalistSummary {
  byline:             string
  publisher_name:     string
  article_count:      number
  avg_framing:        number
  avg_intensity:      number
  avg_fact_ratio:     number
  avg_sensationalism: number
  top_topics:         string[]
  last_article_date:  string
  articles:           ArticleRef[]
}

type SortField = "article_count" | "avg_framing" | "avg_intensity" | "avg_fact_ratio" | "last_article_date"
type SortDir   = "asc" | "desc"
type Leaning   = "all" | "left" | "center" | "right"

// ─────────────────────────────────────────────────────────────────────────────
// Data fetcher — aggregates from articles table
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Byline validation — filters out non-human bylines
// ─────────────────────────────────────────────────────────────────────────────

const JUNK_EXACT: Set<string> = new Set([
  "ani", "pti", "ians", "afp", "reuters", "ap", "aps", "upi", "ubi",
  "staff", "bureau", "team", "admin", "editor", "editors",
  "correspondent", "reporter",
  "web desk", "news desk", "digital desk", "online desk", "national desk",
  "city desk", "metro desk", "sports desk", "entertainment desk",
  "business desk", "politics desk", "foreign desk", "international desk",
  "ht news desk", "ht trending desk", "ht sports desk", "ht syndication",
  "ht bureau", "india tv news", "india tv news desk",
  "ndtv news", "ndtv sports", "ndtv business",
  "the hindu", "the quint", "scroll.in", "the wire", "the print",
  "swarajya staff", "opindia staff", "opindia desk",
  "newslaundry staff", "national herald desk",
  "dw news", "bbc news", "bbc india",
  "press trust of india", "asian news international",
  "news18 hindi", "news18 english",
  "agency", "agencies", "wire service",
  "hindustan times", "times of india",
])

const JUNK_CONTAINS: string[] = [
  "syndication", "news desk", "web desk", "digital desk", "online desk",
  "sports desk", "city desk", "bureau", "news team", "editorial team",
  "staff writer", "staff reporter", "our correspondent", "special correspondent",
  "special reporter", "our bureau", "news agency", "photo desk", "video desk",
  "with inputs", "with reporting", "from the wire",
]

const JUNK_STARTS: string[] = [
  "edited by", "written by", "compiled by", "reported by",
  "with inputs", "with reporting", "agency report",
]

function isLikelyPersonName(byline: string): boolean {
  if (!byline || typeof byline !== "string") return false

  const raw     = byline.trim()
  const lower   = raw.toLowerCase()
  const cleaned = raw.replace(/^(by|by:|author:|written by)\s*/i, "").trim()

  // Too short or too long
  if (cleaned.length < 4 || cleaned.length > 60) return false

  // Contains digits
  if (/\d/.test(cleaned)) return false

  // Contains URLs or @ signs
  if (/@|http|www\./.test(cleaned)) return false

  // All uppercase — almost always an agency (ANI, PTI, IANS, AFP)
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) return false

  // Exact junk match
  if (JUNK_EXACT.has(lower)) return false

  // Contains junk substrings
  if (JUNK_CONTAINS.some(j => lower.includes(j))) return false

  // Starts with junk patterns
  if (JUNK_STARTS.some(j => lower.startsWith(j))) return false

  const parts = cleaned.split(/\s+/)

  // Single word — only allow if it looks like a proper name
  if (parts.length === 1) {
    if (cleaned === cleaned.toLowerCase()) return false
    if (cleaned === cleaned.toUpperCase()) return false
    if (!/^[A-Z][a-z]{3,}$/.test(cleaned)) return false
  }

  // More than 5 words — likely a label not a name
  if (parts.length > 5) return false

  // At least half the words should be Title Case
  const titleCaseWords = parts.filter(p => /^[A-Z][a-z]/.test(p))
  if (titleCaseWords.length < Math.ceil(parts.length * 0.5)) return false

  return true
}

async function fetchJournalistLandscape(): Promise<JournalistSummary[]> {
  const { data, error } = await supabase
    .from("articles")
    .select(`
      id,
      headline,
      url,
      author,
      author_byline,
      publisher_name,
      publication_datetime,
      ai_framing_direction,
      ai_language_intensity,
      ai_fact_ratio,
      ai_sensationalism,
      topic
    `)
    .eq("processed", true)
    .not("ai_framing_direction", "is", null)
    .or("author_byline.not.is.null,author.not.is.null")
    .order("publication_datetime", { ascending: false })

  if (error || !data) return []

  // Group by byline + publisher — only human names
  const grouped: Record<string, {
    publisher: string
    articles: typeof data
  }> = {}

  for (const row of data) {
    // Use author_byline first, fall back to author column
    const rawByline = row.author_byline || (row as any).author || ""

    // Skip non-human bylines
    if (!isLikelyPersonName(rawByline)) continue

    // Clean the byline — strip "By " prefixes
    const cleanByline = rawByline
      .replace(/^(by|by:|author:|written by)\s*/i, "")
      .trim()

    const key = `${cleanByline}|||${row.publisher_name}`
    if (!grouped[key]) {
      grouped[key] = { publisher: row.publisher_name, articles: [] }
    }
    grouped[key].articles.push(row)
  }

  // Compute averages per journalist
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

  return Object.entries(grouped)
    .filter(([, g]) => g.articles.length >= 1) // show all journalists with at least 1 article
    .map(([key, g]) => {
      const byline     = key.split("|||")[0]
      const framings   = g.articles.map(a => a.ai_framing_direction).filter((v): v is number => v != null)
      const intensities = g.articles.map(a => a.ai_language_intensity).filter((v): v is number => v != null)
      const facts      = g.articles.map(a => a.ai_fact_ratio).filter((v): v is number => v != null)
      const senss      = g.articles.map(a => a.ai_sensationalism).filter((v): v is number => v != null)

      const topicCounts: Record<string, number> = {}
      g.articles.forEach(a => {
        if (a.topic) topicCounts[a.topic] = (topicCounts[a.topic] || 0) + 1
      })
      const top_topics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)

      return {
        byline,
        publisher_name:     g.publisher,
        article_count:      g.articles.length,
        avg_framing:        avg(framings),
        avg_intensity:      avg(intensities),
        avg_fact_ratio:     avg(facts),
        avg_sensationalism: avg(senss),
        top_topics,
        last_article_date:  g.articles[0]?.publication_datetime ?? "",
        articles:           g.articles.map(a => ({
          id:      (a as any).id,
          headline:(a as any).headline ?? "",
          url:     (a as any).url ?? "",
          date:    a.publication_datetime ?? "",
          framing: a.ai_framing_direction,
          topic:   a.topic,
        })),
      }
    })
    .sort((a, b) => b.article_count - a.article_count)
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function framingLabel(v: number): string {
  if (v >  0.5) return "Strong right"
  if (v >  0.2) return "Right-leaning"
  if (v < -0.5) return "Strong left"
  if (v < -0.2) return "Left-leaning"
  return "Neutral"
}

function framingColor(v: number): string {
  if (v >  0.2) return "text-red-600 dark:text-red-400"
  if (v < -0.2) return "text-blue-600 dark:text-blue-400"
  return "text-muted-foreground"
}

function framingBg(v: number): string {
  if (v >  0.2) return "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
  if (v < -0.2) return "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
  return "bg-muted/40 text-muted-foreground border-border"
}

function intensityColor(v: number): string {
  if (v > 0.7) return "text-red-600 dark:text-red-400"
  if (v > 0.4) return "text-amber-600 dark:text-amber-400"
  return "text-green-600 dark:text-green-400"
}

function MiniBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(Math.abs(value) * 100, 100)}%` }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  )
}

function FramingPosition({ value }: { value: number }) {
  // A slider showing position from -1 to +1
  const pct = ((value + 1) / 2) * 100
  return (
    <div className="relative w-full h-1.5 rounded-full bg-gradient-to-r from-blue-300 via-muted to-red-300 overflow-visible">
      <div
        className="absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-full bg-foreground shadow-sm"
        style={{ left: `calc(${pct}% - 2px)` }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Journalist card
// ─────────────────────────────────────────────────────────────────────────────

function JournalistCard({
  journalist,
  onSelect,
}: {
  journalist: JournalistSummary
  onSelect: (j: JournalistSummary) => void
}) {
  const daysAgo = journalist.last_article_date
    ? Math.floor((Date.now() - new Date(journalist.last_article_date).getTime()) / 86_400_000)
    : null

  return (
    <button
      onClick={() => onSelect(journalist)}
      className="w-full text-left rounded-xl border bg-card hover:bg-muted/20 transition-colors group shadow-sm p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors truncate">
            {journalist.byline}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground truncate">{journalist.publisher_name}</p>
          </div>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${framingBg(journalist.avg_framing)}`}>
          {framingLabel(journalist.avg_framing)}
        </span>
      </div>

      {/* Framing position bar */}
      <FramingPosition value={journalist.avg_framing} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Articles</p>
          <p className="text-sm font-bold tabular-nums">{journalist.article_count}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Intensity</p>
          <p className={`text-sm font-bold ${intensityColor(journalist.avg_intensity)}`}>
            {journalist.avg_intensity > 0.7 ? "High" : journalist.avg_intensity > 0.4 ? "Med" : "Low"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fact ratio</p>
          <p className="text-sm font-bold tabular-nums">{Math.round(journalist.avg_fact_ratio * 100)}%</p>
        </div>
      </div>

      {/* Topics */}
      {journalist.top_topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {journalist.top_topics.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Recency */}
      {daysAgo !== null && (
        <p className="text-[10px] text-muted-foreground">
          Last article {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
        </p>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Journalist detail drawer
// ─────────────────────────────────────────────────────────────────────────────

function JournalistDrawer({
  journalist,
  allJournalists,
  onClose,
  navigate,
}: {
  journalist: JournalistSummary
  allJournalists: JournalistSummary[]
  onClose: () => void
  navigate: (path: string) => void
}) {
  // Peers = same publisher
  const peers = allJournalists.filter(
    j => j.publisher_name === journalist.publisher_name && j.byline !== journalist.byline
  )
  const peerAvgFraming    = peers.length ? peers.reduce((s, j) => s + j.avg_framing, 0) / peers.length : null
  const peerAvgIntensity  = peers.length ? peers.reduce((s, j) => s + j.avg_intensity, 0) / peers.length : null
  const framingDiff       = peerAvgFraming != null ? journalist.avg_framing - peerAvgFraming : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative ml-auto h-full w-full max-w-md bg-background border-l shadow-xl overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Close */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Journalist profile</span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Identity */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold">{journalist.byline}</h2>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                {journalist.publisher_name}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">
                {journalist.article_count} articles analysed
              </span>
            </div>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full border font-medium ${framingBg(journalist.avg_framing)}`}>
              {framingLabel(journalist.avg_framing)}
            </span>
          </div>

          {/* Framing position */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Political framing spectrum</p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Left</span>
                <span>Neutral</span>
                <span>Right</span>
              </div>
              <FramingPosition value={journalist.avg_framing} />
              <p className="text-[10px] text-center font-mono text-muted-foreground">
                {journalist.avg_framing > 0 ? "+" : ""}{journalist.avg_framing.toFixed(3)}
              </p>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Writing signature</p>
            <div className="rounded-lg border divide-y">
              {[
                {
                  label:  "Language intensity",
                  value:  journalist.avg_intensity,
                  display: journalist.avg_intensity > 0.7 ? "High" : journalist.avg_intensity > 0.4 ? "Moderate" : "Low",
                  cls:    intensityColor(journalist.avg_intensity),
                  note:   journalist.avg_intensity > 0.7 ? "Consistently charged language" : journalist.avg_intensity < 0.3 ? "Restrained, measured tone" : "Moderate emotional register",
                },
                {
                  label:   "Fact ratio",
                  value:   journalist.avg_fact_ratio,
                  display: `${Math.round(journalist.avg_fact_ratio * 100)}%`,
                  cls:     journalist.avg_fact_ratio < 0.4 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                  note:    journalist.avg_fact_ratio > 0.6 ? "Predominantly fact-based" : journalist.avg_fact_ratio < 0.4 ? "Higher proportion of opinion/rhetoric" : "Mixed fact and analysis",
                },
                {
                  label:   "Sensationalism",
                  value:   journalist.avg_sensationalism,
                  display: `${Math.round(journalist.avg_sensationalism * 100)}%`,
                  cls:     journalist.avg_sensationalism > 0.6 ? "text-red-600 dark:text-red-400" : "text-foreground",
                  note:    journalist.avg_sensationalism > 0.6 ? "Tends toward dramatic framing" : "Generally restrained in presentation",
                },
              ].map(row => (
                <div key={row.label} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className={`text-sm font-bold ${row.cls}`}>{row.display}</p>
                  </div>
                  <MiniBar value={row.value} />
                  <p className="text-[10px] text-muted-foreground">{row.note}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Topic coverage */}
          {journalist.top_topics.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topic focus</p>
              <div className="flex flex-wrap gap-1.5">
                {journalist.top_topics.map(t => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full border bg-muted/40 text-muted-foreground font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comparison with publication peers */}
          {peers.length > 0 && peerAvgFraming !== null && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                vs. {journalist.publisher_name} colleagues ({peers.length} others)
              </p>
              <div className="rounded-lg border divide-y">
                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Framing vs publication avg</p>
                    <span className={`flex items-center gap-1 text-xs font-medium ${
                      framingDiff! > 0.2 ? "text-red-500" : framingDiff! < -0.2 ? "text-blue-500" : "text-green-600 dark:text-green-400"
                    }`}>
                      {Math.abs(framingDiff!) < 0.05
                        ? <><Minus className="h-3 w-3" /> Aligned</>
                        : framingDiff! > 0
                        ? <><TrendingUp className="h-3 w-3" /> +{framingDiff!.toFixed(2)} more right</>
                        : <><TrendingDown className="h-3 w-3" /> {framingDiff!.toFixed(2)} more left</>
                      }
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-16">This journalist</span>
                      <MiniBar value={journalist.avg_framing} color="bg-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-16">Publication avg</span>
                      <MiniBar value={peerAvgFraming} color="bg-muted-foreground/40" />
                    </div>
                  </div>
                </div>

                {peerAvgIntensity !== null && (
                  <div className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Intensity vs publication avg</p>
                      <span className={`text-xs font-medium ${intensityColor(journalist.avg_intensity)}`}>
                        {journalist.avg_intensity > peerAvgIntensity + 0.1
                          ? "More intense than peers"
                          : journalist.avg_intensity < peerAvgIntensity - 0.1
                          ? "More restrained than peers"
                          : "Aligned with peers"
                        }
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16">This journalist</span>
                        <MiniBar value={journalist.avg_intensity} color="bg-amber-500/60" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-16">Publication avg</span>
                        <MiniBar value={peerAvgIntensity} color="bg-muted-foreground/40" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Insight summary */}
          <div className="rounded-lg bg-muted/30 border p-4 space-y-2">
            <p className="text-xs font-semibold">Summary</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {journalist.byline} is a journalist at {journalist.publisher_name} with{" "}
              {journalist.article_count} articles analysed by SCRY. Their writing leans{" "}
              <span className={framingColor(journalist.avg_framing)}>{framingLabel(journalist.avg_framing).toLowerCase()}</span>{" "}
              with {journalist.avg_intensity > 0.7 ? "high" : journalist.avg_intensity > 0.4 ? "moderate" : "low"} language intensity
              and a {Math.round(journalist.avg_fact_ratio * 100)}% fact ratio.
              {journalist.top_topics.length > 0 && ` Their primary coverage areas are ${journalist.top_topics.slice(0, 2).join(" and ")}.`}
              {framingDiff !== null && Math.abs(framingDiff) > 0.2 && (
                ` Their framing is ${framingDiff > 0 ? "more right-leaning" : "more left-leaning"} than their publication's average.`
              )}
            </p>
          </div>

          {/* Article sources */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Articles in SCRY ({journalist.articles.length})
            </p>
            <div className="rounded-lg border divide-y overflow-hidden">
              {journalist.articles.map(a => (
                <div key={a.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium leading-snug flex-1 line-clamp-2">{a.headline}</p>
                    <button
                      onClick={() => navigate(`/article/${a.id}`)}
                      className="shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary"
                      title="View SCRY analysis"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {a.topic && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                        {a.topic}
                      </span>
                    )}
                    {a.framing != null && (
                      <span className={`text-[10px] font-mono ${framingColor(a.framing)}`}>
                        {a.framing > 0 ? "+" : ""}{a.framing.toFixed(2)}
                      </span>
                    )}
                    {a.date && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </aside>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher summary row
// ─────────────────────────────────────────────────────────────────────────────

function PublisherRow({
  publisher,
  journalists,
  onSelectJournalist,
}: {
  publisher:           string
  journalists:         JournalistSummary[]
  onSelectJournalist:  (j: JournalistSummary) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const avgFraming   = journalists.reduce((s, j) => s + j.avg_framing,   0) / journalists.length
  const avgIntensity = journalists.reduce((s, j) => s + j.avg_intensity, 0) / journalists.length
  const totalArticles = journalists.reduce((s, j) => s + j.article_count, 0)

  // Topic spread across all journalists in this publication
  const topicCounts: Record<string, number> = {}
  journalists.forEach(j => j.top_topics.forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1 }))
  const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Publisher name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">{publisher}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${framingBg(avgFraming)}`}>
              {framingLabel(avgFraming)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> {journalists.length} journalist{journalists.length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Newspaper className="h-3 w-3" /> {totalArticles} articles
            </span>
          </div>
        </div>

        {/* Publication-level framing bar */}
        <div className="w-32 hidden sm:block">
          <FramingPosition value={avgFraming} />
        </div>

        {/* Topic chips */}
        <div className="hidden lg:flex flex-wrap gap-1 max-w-[180px]">
          {topTopics.map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">{t}</span>
          ))}
        </div>

        {/* Expand */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {journalists.map(j => (
            <JournalistCard key={j.byline} journalist={j} onSelect={onSelectJournalist} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const TOPICS = [
  "Politics", "Economy", "Defence", "Foreign Policy", "Crime",
  "Environment", "Health", "Technology", "Social Issues", "Business", "Judiciary",
]

export default function JournalistIntelligence() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [journalists,  setJournalists]  = useState<JournalistSummary[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [selected,     setSelected]     = useState<JournalistSummary | null>(null)

  // Filters
  const [search,       setSearch]       = useState("")
  const [publisher,    setPublisher]    = useState("all")
  const [topic,        setTopic]        = useState("all")
  const [leaning,      setLeaning]      = useState<Leaning>("all")
  const [sortField,    setSortField]    = useState<SortField>("article_count")
  const [sortDir,      setSortDir]      = useState<SortDir>("desc")
  const [view,         setView]         = useState<"flat" | "grouped">("grouped")

  useEffect(() => {
    fetchJournalistLandscape()
      .then(setJournalists)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const publishers = useMemo(() =>
    Array.from(new Set(journalists.map(j => j.publisher_name))).sort(),
  [journalists])

  const filtered = useMemo(() => {
    let result = journalists.filter(j => {
      if (search && !j.byline.toLowerCase().includes(search.toLowerCase()) &&
                    !j.publisher_name.toLowerCase().includes(search.toLowerCase())) return false
      if (publisher !== "all" && j.publisher_name !== publisher) return false
      if (topic !== "all" && !j.top_topics.includes(topic)) return false
      if (leaning === "left"   && j.avg_framing >= -0.2) return false
      if (leaning === "right"  && j.avg_framing <=  0.2) return false
      if (leaning === "center" && Math.abs(j.avg_framing) > 0.2) return false
      return true
    })

    result.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1
      if (sortField === "last_article_date") {
        return dir * (new Date(a.last_article_date).getTime() - new Date(b.last_article_date).getTime())
      }
      return dir * ((a[sortField] as number) - (b[sortField] as number))
    })

    return result
  }, [journalists, search, publisher, topic, leaning, sortField, sortDir])

  // Group by publisher
  const byPublisher = useMemo(() => {
    const groups: Record<string, JournalistSummary[]> = {}
    filtered.forEach(j => {
      if (!groups[j.publisher_name]) groups[j.publisher_name] = []
      groups[j.publisher_name].push(j)
    })
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  const hasFilters = search || publisher !== "all" || topic !== "all" || leaning !== "all"

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:px-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Journalist Intelligence</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Writing patterns, framing signatures, and topic focus across all journalists in SCRY's database.
          </p>
        </div>
        {!loading && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums">{journalists.length}</p>
            <p className="text-xs text-muted-foreground">journalists tracked</p>
          </div>
        )}
      </div>

      {/* Topic pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTopic("all")}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
            topic === "all"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-background border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          All topics
        </button>
        {TOPICS.map(t => (
          <button
            key={t}
            onClick={() => setTopic(topic === t ? "all" : t)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
              topic === t
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Search + filters toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or publication…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={publisher}
          onChange={e => setPublisher(e.target.value)}
          className="rounded-lg border bg-card px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground"
        >
          <option value="all">All publishers</option>
          {publishers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={leaning}
          onChange={e => setLeaning(e.target.value as Leaning)}
          className="rounded-lg border bg-card px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground"
        >
          <option value="all">All framings</option>
          <option value="left">Left-leaning</option>
          <option value="center">Neutral</option>
          <option value="right">Right-leaning</option>
        </select>

        <select
          value={sortField}
          onChange={e => setSortField(e.target.value as SortField)}
          className="rounded-lg border bg-card px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground"
        >
          <option value="article_count">Sort: article count</option>
          <option value="avg_framing">Sort: framing</option>
          <option value="avg_intensity">Sort: intensity</option>
          <option value="avg_fact_ratio">Sort: fact ratio</option>
          <option value="last_article_date">Sort: most recent</option>
        </select>

        <button
          onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
          className="p-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          {(["grouped", "flat"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                view === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "grouped" ? "By publication" : "All journalists"}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground font-mono">
        {loading ? "Loading…" : `${filtered.length} journalist${filtered.length !== 1 ? "s" : ""}${hasFilters ? " — filtered" : ""}`}
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader className="h-4 w-4 animate-spin" />
          <span className="text-sm">Building journalist profiles…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border bg-card p-6 text-sm text-destructive text-center">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 space-y-2">
          <p className="text-muted-foreground text-sm">No journalists found matching your filters.</p>
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setPublisher("all"); setTopic("all"); setLeaning("all") }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grouped view */}
      {!loading && !error && filtered.length > 0 && view === "grouped" && (
        <div className="space-y-3">
          {byPublisher.map(([pub, journos]) => (
            <PublisherRow
              key={pub}
              publisher={pub}
              journalists={journos}
              onSelectJournalist={setSelected}
            />
          ))}
        </div>
      )}

      {/* Flat view */}
      {!loading && !error && filtered.length > 0 && view === "flat" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(j => (
            <JournalistCard key={`${j.byline}-${j.publisher_name}`} journalist={j} onSelect={setSelected} />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <JournalistDrawer
          journalist={selected}
          allJournalists={journalists}
          onClose={() => setSelected(null)}
          navigate={navigate}
        />
      )}
    </div>
  )
}
