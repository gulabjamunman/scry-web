import { useEffect, useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart, Line, BarChart, Bar, Cell,
} from "recharts"
import { format, parseISO, formatDistanceToNow } from "date-fns"
import {
  ArrowLeft, ExternalLink, ChevronDown, ChevronUp,
  AlertCircle, BookOpen, Lock, ArrowRight, FileText,
} from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useFreeCluster } from "@/contexts/FreeClusterContext"
import {
  getClusterIntelligence,
  type ClusterIntelligence,
  type ClusterArticle,
  type ClusterPublisherStat,
  type NarrativeArc,
  type NarrativeArcSection,
} from "@/lib/api"

// ─────────────────────────────────────────────────────────────────────────────
// Publisher colours
// ─────────────────────────────────────────────────────────────────────────────

const PUB_COLORS: Record<string, string> = {
  "Times of India":  "hsl(290, 55%, 55%)",
  "News18":          "hsl(25,  80%, 50%)",
  "Swarajya Mag":    "hsl(0,   65%, 50%)",
  "OpIndia":         "hsl(0,   75%, 42%)",
  "India TV News":   "hsl(30,  75%, 50%)",
  "NDTV":            "hsl(215, 60%, 52%)",
  "National Herald": "hsl(260, 48%, 52%)",
  "Scroll.in":       "hsl(195, 65%, 42%)",
  "The Quint":       "hsl(205, 62%, 46%)",
  "The Hindu":       "hsl(155, 50%, 38%)",
  "Indian Express":  "hsl(160, 45%, 42%)",
  "BBC India":       "hsl(45,  80%, 44%)",
  "DW Asia":         "hsl(50,  70%, 46%)",
}
const pubColor = (n: string) => PUB_COLORS[n] ?? "hsl(215, 15%, 55%)"

// ─────────────────────────────────────────────────────────────────────────────
// Rotating loader
// ─────────────────────────────────────────────────────────────────────────────

const ARC_LOADING_WORDS = [
  "Tracking", "Analysing", "Mapping sources",
  "Identifying divergence", "Generating arc",
]

function RotatingLoader() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % ARC_LOADING_WORDS.length), 800)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <span className="tabular-nums w-40 transition-all">{ARC_LOADING_WORDS[idx]}…</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Score helpers
// ─────────────────────────────────────────────────────────────────────────────

function MeterBar({ value, colorClass = "bg-primary" }: { value: number | null; colorClass?: string }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(Math.abs(value) * 100, 100)}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{value.toFixed(3)}</span>
    </div>
  )
}

function FramingChip({ value }: { value: number | null }) {
  if (value == null) return null
  const label = value < -0.2 ? "Left" : value > 0.2 ? "Right" : "Neutral"
  const cls   = value < -0.2
    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800"
    : value > 0.2
    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-red-200 dark:border-red-800"
    : "bg-muted text-muted-foreground border-border"
  return <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>{label}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// Recharts shared tooltip
// ─────────────────────────────────────────────────────────────────────────────

const ttStyle = {
  contentStyle: {
    background: "hsl(var(--card))",
    border:     "1px solid hsl(var(--border))",
    borderRadius: 8, fontSize: 12,
    color: "hsl(var(--foreground))",
    boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
  },
  itemStyle:  { color: "hsl(var(--muted-foreground))" },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 600 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Story Identity
// ─────────────────────────────────────────────────────────────────────────────

function StoryIdentity({ data }: { data: ClusterIntelligence }) {
  const { identity, signals } = data
  const age     = identity.first_seen ? formatDistanceToNow(parseISO(identity.first_seen), { addSuffix: true }) : "—"
  const updated = identity.last_seen  ? format(parseISO(identity.last_seen), "d MMM yyyy, HH:mm") : "—"
  const framingLabel = signals.avg_framing_direction == null ? "Undetermined"
    : signals.avg_framing_direction < -0.2 ? "Left-leaning"
    : signals.avg_framing_direction > 0.2  ? "Right-leaning"
    : "Broadly neutral"

  // report_enabled and report_cache come through on identity via getClusterIdentity
  const reportEnabled = (identity as any).report_enabled === true
  const hasBrief      = reportEnabled && !!(identity as any).report_cache

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">

      {/* Top strip */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {identity.is_active && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {identity.dominant_topic && (
            <span className="text-xs px-2 py-0.5 rounded-full border bg-background text-muted-foreground">
              {identity.dominant_topic}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Export Brief button — only visible when report is enabled and cached */}
          {hasBrief && (
            <a
              href={`/cluster/${identity.id}/brief`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-muted/50 text-foreground font-medium transition-colors"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              Export Brief
            </a>
          )}
          <span className="font-mono text-xs text-muted-foreground tracking-wider">
            {identity.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight leading-snug">{identity.title}</h1>

        {identity.summary && (
          <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3 italic">
            {identity.summary}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
          {[
            { label: "Articles",       value: identity.article_count,   sub: `${identity.publisher_count} publishers` },
            { label: "Silent outlets", value: identity.silent_count,    sub: "did not cover this" },
            { label: "Framing",        value: framingLabel,             sub: signals.avg_framing_direction != null ? `score ${signals.avg_framing_direction.toFixed(3)}` : "" },
            { label: "Last updated",   value: updated,                  sub: `First seen ${age}` },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">{s.label}</p>
              <p className="text-sm font-semibold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Narrative Arc
// ─────────────────────────────────────────────────────────────────────────────

const ARC_SECTIONS: { key: keyof NarrativeArc; label: string; description: string }[] = [
  { key: "origin",        label: "Origin",        description: "Who broke this story and how they framed it" },
  { key: "propagation",   label: "How it spread", description: "Which outlets picked it up and what changed" },
  { key: "fault_lines",   label: "Fault lines",   description: "Where outlets told meaningfully different versions" },
  { key: "silences",      label: "Silences",      description: "Which outlets didn't cover it and what that suggests" },
  { key: "current_state", label: "Current state", description: "Where coverage stands now" },
]

function CitationLink({ index, articleId, articles }: {
  index: number; articleId: string; articles: ClusterArticle[]
}) {
  const article = articles.find(a => a.id === articleId)
  if (!article) return <sup className="text-xs text-muted-foreground ml-0.5">[{index}]</sup>
  return (
    <sup className="ml-0.5">
      {article.url
        ? <a href={article.url} target="_blank" rel="noopener noreferrer"
            title={`${article.publisher_name}: ${article.headline}`}
            className="text-xs text-primary hover:underline font-mono">[{index}]</a>
        : <span title={`${article.publisher_name}: ${article.headline}`}
            className="text-xs text-muted-foreground font-mono cursor-help">[{index}]</span>
      }
    </sup>
  )
}

function ArcSectionBlock({ section, label, description, articles, citationOffset }: {
  section: NarrativeArcSection; label: string; description: string
  articles: ClusterArticle[]; citationOffset: number
}) {
  if (!section?.text) return null
  const citedArticles = (section.citations || []).map((id, i) => ({ id, index: citationOffset + i + 1 }))
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <p className="text-sm leading-relaxed text-foreground">
        {section.text}
        {citedArticles.map(c => <CitationLink key={c.id} index={c.index} articleId={c.id} articles={articles} />)}
      </p>
    </div>
  )
}

function NarrativeArcSection_({ arc, articles, generated_at }: {
  arc: NarrativeArc; articles: ClusterArticle[]; generated_at: string | null
}) {
  let citationOffset = 0
  const sectionOffsets: Record<string, number> = {}
  ARC_SECTIONS.forEach(s => {
    sectionOffsets[s.key] = citationOffset
    citationOffset += (arc[s.key]?.citations?.length || 0)
  })
  const allCitations: { index: number; article: ClusterArticle }[] = []
  ARC_SECTIONS.forEach(s => {
    const offset = sectionOffsets[s.key]
    ;(arc[s.key]?.citations || []).forEach((id, i) => {
      const article = articles.find(a => a.id === id)
      if (article) allCitations.push({ index: offset + i + 1, article })
    })
  })
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-3.5 border-b bg-muted/20">
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="text-sm font-semibold">Narrative Arc</p>
          <p className="text-xs text-muted-foreground">How this story moved through the Indian media ecosystem</p>
        </div>
        {generated_at && (
          <span className="ml-auto text-xs text-muted-foreground font-mono shrink-0">
            Generated {formatDistanceToNow(parseISO(generated_at), { addSuffix: true })}
          </span>
        )}
      </div>
      <div className="p-6 space-y-6">
        {ARC_SECTIONS.map(s => (
          <ArcSectionBlock key={s.key} section={arc[s.key]} label={s.label}
            description={s.description} articles={articles} citationOffset={sectionOffsets[s.key]} />
        ))}
        {allCitations.length > 0 && (
          <div className="pt-4 border-t space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
            <div className="space-y-1.5">
              {allCitations.map(({ index, article }) => (
                <div key={`${index}-${article.id}`} className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-muted-foreground shrink-0 mt-0.5">[{index}]</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium" style={{ color: pubColor(article.publisher_name) }}>{article.publisher_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {article.publication_datetime ? format(parseISO(article.publication_datetime), "d MMM yyyy, HH:mm") : ""}
                      </span>
                    </div>
                    <p className="text-xs text-foreground leading-snug mt-0.5">
                      {article.headline}
                      {article.url && (
                        <a href={article.url} target="_blank" rel="noopener noreferrer"
                          className="ml-1.5 text-primary hover:underline inline-flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NarrativeArcBlock({ identity, articles }: {
  identity: ClusterIntelligence["identity"]; articles: ClusterArticle[]
}) {
  if (identity.article_count < 2) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">
            The narrative arc will be available once more coverage is collected.
            Currently {identity.article_count} article{identity.article_count !== 1 ? "s" : ""} — need at least 2.
          </p>
        </div>
      </div>
    )
  }
  if (!identity.narrative_arc) {
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6">
        <div className="flex items-center gap-3">
          <RotatingLoader />
          <p className="text-sm text-muted-foreground">Arc will be generated on the next pipeline run.</p>
        </div>
      </div>
    )
  }
  return (
    <NarrativeArcSection_
      arc={identity.narrative_arc}
      articles={articles}
      generated_at={identity.narrative_arc_generated_at}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Narrative Landscape
// ─────────────────────────────────────────────────────────────────────────────

function NarrativeLandscape({ articles }: { articles: ClusterArticle[] }) {
  const analyzed = articles.filter(a => a.ai_framing_direction != null && a.ai_language_intensity != null)

  if (analyzed.length < 9) {
    const left    = analyzed.filter(a => (a.ai_framing_direction ?? 0) < -0.15).length
    const neutral = analyzed.filter(a => Math.abs(a.ai_framing_direction ?? 0) <= 0.15).length
    const right   = analyzed.filter(a => (a.ai_framing_direction ?? 0) > 0.15).length
    return (
      <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
        <div>
          <p className="text-sm font-semibold mb-0.5">Narrative Composition</p>
          <p className="text-xs text-muted-foreground">Scatter plot requires 9+ analyzed articles. Framing breakdown shown below.</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Left-framed",  count: left,    cls: "text-blue-600 dark:text-blue-400",  sub: "Social justice, minority rights, structural critique" },
            { label: "Neutral",      count: neutral, cls: "text-muted-foreground",             sub: "Balanced or factual reporting" },
            { label: "Right-framed", count: right,   cls: "text-red-600 dark:text-red-400",    sub: "Nationalism, security, authority" },
          ].map(b => (
            <div key={b.label} className="rounded-lg border bg-muted/30 p-4 text-center">
              <p className={`text-3xl font-bold tabular-nums ${b.cls}`}>{b.count}</p>
              <p className="text-xs font-semibold mt-1">{b.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{b.sub}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const scatterData = Object.entries(
    analyzed.reduce((acc, a) => {
      const pub = a.publisher_name
      if (!acc[pub]) acc[pub] = []
      acc[pub].push({ x: a.ai_framing_direction!, y: a.ai_language_intensity!, article: a })
      return acc
    }, {} as Record<string, any[]>)
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-0.5">Narrative Landscape</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Each point is one article. Position reflects political framing (left–right) and language intensity (vertical).
        </p>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 50, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" dataKey="x" domain={[-1, 1]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            label={{ value: "← Left-leaning     Framing Direction     Right-leaning →", position: "insideBottom", offset: -32, fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            label={{ value: "Intensity", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <ZAxis range={[55, 55]} />
          <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <ReferenceLine y={0.5} stroke="hsl(var(--border))" strokeDasharray="4 4" />
          <Tooltip {...ttStyle} content={({ payload }) => {
            if (!payload?.length) return null
            const a: ClusterArticle = payload[0].payload.article
            return (
              <div className="rounded-lg border bg-card shadow-lg p-3 text-xs max-w-[240px] space-y-1.5">
                <p className="font-semibold text-sm" style={{ color: pubColor(a.publisher_name) }}>{a.publisher_name}</p>
                <p className="text-foreground leading-snug">{a.headline.slice(0, 100)}{a.headline.length > 100 ? "…" : ""}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground pt-1 border-t">
                  <span>Framing</span><span className="font-mono font-semibold text-foreground">{a.ai_framing_direction?.toFixed(3)}</span>
                  <span>Intensity</span><span className="font-mono font-semibold text-foreground">{a.ai_language_intensity?.toFixed(3)}</span>
                  {a.ai_fact_ratio != null && <><span>Fact ratio</span><span className="font-mono font-semibold text-foreground">{a.ai_fact_ratio.toFixed(3)}</span></>}
                </div>
                {a.likely_syndicated && <p className="text-amber-600 dark:text-amber-400">⚠ Syndicated content</p>}
              </div>
            )
          }} />
          {scatterData.map(([pub, pts]) => (
            <Scatter key={pub} name={pub} data={pts} fill={pubColor(pub)}
              shape={(props: any) => {
                const { cx, cy } = props
                const c = pubColor(pub)
                return <g><circle cx={cx} cy={cy} r={8} fill={c} fillOpacity={0.15} stroke={c} strokeWidth={1.5} /><circle cx={cx} cy={cy} r={3.5} fill={c} /></g>
              }} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {[...new Set(articles.map(a => a.publisher_name))].map(pub => (
          <div key={pub} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: pubColor(pub) }} />
            <span className="text-xs text-muted-foreground">{pub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Coverage Map
// ─────────────────────────────────────────────────────────────────────────────

function CoverageMap({ stats, silent }: { stats: ClusterPublisherStat[]; silent: string[] }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-0.5">Coverage Map</p>
        <p className="text-xs text-muted-foreground">
          How each publisher framed this story. Framing direction: −1 (strongly left) to +1 (strongly right).
        </p>
      </div>
      {stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">No analyzed articles yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {["Publisher", "Articles", "Framing", "Intensity", "Fact ratio", "Threat"].map(h => (
                  <th key={h} className="text-left pb-2 pr-4 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.map(s => (
                <tr key={s.publisher_name} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: pubColor(s.publisher_name) }} />
                      <span className="font-medium text-sm whitespace-nowrap">{s.publisher_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 font-mono font-bold text-primary">{s.article_count}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-muted relative overflow-visible">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                        {s.avg_framing != null && (
                          <div className={`absolute h-full rounded-full ${s.avg_framing < 0 ? "bg-blue-500" : "bg-red-500"}`}
                            style={{ width: `${Math.abs(s.avg_framing) * 50}%`, left: s.avg_framing < 0 ? `${50 - Math.abs(s.avg_framing) * 50}%` : "50%" }} />
                        )}
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.avg_framing?.toFixed(2) ?? "—"}</span>
                      <FramingChip value={s.avg_framing} />
                    </div>
                  </td>
                  <td className="py-2.5 pr-4"><MeterBar value={s.avg_intensity} colorClass="bg-amber-500" /></td>
                  <td className="py-2.5 pr-4"><MeterBar value={s.avg_fact_ratio} colorClass="bg-blue-500" /></td>
                  <td className="py-2.5"><MeterBar value={s.avg_threat_signal} colorClass="bg-red-500" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {silent.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Did not cover this story — {silent.length} outlet{silent.length !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            An outlet's absence from a widely covered story is an editorial signal.
          </p>
          <div className="flex flex-wrap gap-2">
            {silent.map(pub => (
              <span key={pub} className="text-xs px-2 py-1 rounded border bg-background text-muted-foreground">{pub}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Narrative Signals
// ─────────────────────────────────────────────────────────────────────────────

function NarrativeSignals({ data }: { data: ClusterIntelligence }) {
  const { signals } = data
  const analyzed = data.articles.filter(a => a.ai_framing_direction != null)
  const framingBins = [
    { label: "Strong Left (< −0.6)",      color: "bg-blue-600",        textColor: "text-blue-600 dark:text-blue-400",  count: analyzed.filter(a => a.ai_framing_direction! < -0.6).length },
    { label: "Lean Left (−0.6 to −0.2)",  color: "bg-blue-400",        textColor: "text-blue-500 dark:text-blue-300",  count: analyzed.filter(a => a.ai_framing_direction! >= -0.6 && a.ai_framing_direction! < -0.2).length },
    { label: "Neutral (−0.2 to +0.2)",    color: "bg-muted-foreground", textColor: "text-muted-foreground",            count: analyzed.filter(a => Math.abs(a.ai_framing_direction!) <= 0.2).length },
    { label: "Lean Right (+0.2 to +0.6)", color: "bg-red-400",         textColor: "text-red-500 dark:text-red-300",    count: analyzed.filter(a => a.ai_framing_direction! > 0.2 && a.ai_framing_direction! <= 0.6).length },
    { label: "Strong Right (> +0.6)",     color: "bg-red-600",         textColor: "text-red-600 dark:text-red-400",    count: analyzed.filter(a => a.ai_framing_direction! > 0.6).length },
  ]
  const signalRows = [
    { label: "Avg framing direction",  value: signals.avg_framing_direction, note: "Negative = left, positive = right, zero = neutral.", colorClass: signals.avg_framing_direction == null ? "" : signals.avg_framing_direction < -0.15 ? "text-blue-600 dark:text-blue-400" : signals.avg_framing_direction > 0.15 ? "text-red-600 dark:text-red-400" : "" },
    { label: "Avg language intensity", value: signals.avg_intensity,         note: "0 = calm and factual. 1 = highly emotional or inflammatory.", colorClass: "text-amber-600 dark:text-amber-400" },
    { label: "Avg threat signal",      value: signals.avg_threat_signal,     note: "Derived from anger, fear, and disgust word proportions.", colorClass: "text-red-600 dark:text-red-400" },
    { label: "Avg fact ratio",         value: signals.avg_fact_ratio,        note: "Proportion of verifiable claims. Official announcements without evidence do not count.", colorClass: "text-blue-600 dark:text-blue-400" },
    { label: "Avg context score",      value: signals.avg_context_score,     note: "How well articles provide background, comparative data, and independent sourcing.", colorClass: "text-green-600 dark:text-green-400" },
  ]
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-6">
      <div>
        <p className="text-sm font-semibold mb-0.5">Narrative Signals</p>
        <p className="text-xs text-muted-foreground leading-relaxed">Aggregate psychological and epistemic signals across the full story corpus.</p>
      </div>
      <div className="divide-y">
        {signalRows.map(s => (
          <div key={s.label} className="py-3 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.note}</p>
            </div>
            <span className={`font-mono text-lg font-bold tabular-nums shrink-0 ${s.colorClass}`}>
              {s.value != null ? s.value.toFixed(3) : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="space-y-2.5 pt-2 border-t">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Framing distribution</p>
        {framingBins.map(b => {
          const pct = analyzed.length ? (b.count / analyzed.length) * 100 : 0
          return (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-44 shrink-0">{b.label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${b.color}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-xs font-mono tabular-nums w-16 text-right shrink-0 ${b.textColor}`}>
                {b.count} ({pct.toFixed(0)}%)
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Article Comparison
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = "publication_datetime" | "ai_framing_direction" | "ai_language_intensity" | "ai_fact_ratio"

function ArticleCard({ article, index }: { article: ClusterArticle; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const c    = pubColor(article.publisher_name)
  const date = article.publication_datetime ? format(parseISO(article.publication_datetime), "d MMM yyyy, HH:mm") : "—"
  return (
    <div id={`article-${article.id}`} className="rounded-lg border bg-card overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: c }}>
      <div className="p-4 cursor-pointer hover:bg-muted/30 transition-colors flex items-start gap-3" onClick={() => setExpanded(e => !e)}>
        <span className="font-mono text-xs text-muted-foreground mt-0.5 shrink-0 w-5 text-right">{index + 1}</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: c }}>{article.publisher_name}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
            {article.likely_syndicated && <span className="text-xs px-1.5 py-0.5 rounded border text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">Wire</span>}
            {article.review_count > 0 && <span className="text-xs px-1.5 py-0.5 rounded border text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30">{article.review_count} review{article.review_count > 1 ? "s" : ""}</span>}
          </div>
          <p className="text-sm font-medium leading-snug">{article.headline}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <FramingChip value={article.ai_framing_direction} />
            <span className="text-xs text-muted-foreground">intensity {article.ai_language_intensity?.toFixed(2) ?? "—"} · fact {article.ai_fact_ratio?.toFixed(2) ?? "—"}</span>
          </div>
        </div>
        <div className="text-muted-foreground shrink-0 mt-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              { label: "Framing direction",  value: article.ai_framing_direction,     cls: article.ai_framing_direction == null ? "" : article.ai_framing_direction < -0.15 ? "text-blue-600 dark:text-blue-400" : article.ai_framing_direction > 0.15 ? "text-red-600 dark:text-red-400" : "" },
              { label: "Language intensity", value: article.ai_language_intensity,    cls: "text-amber-600 dark:text-amber-400" },
              { label: "Fact ratio",         value: article.ai_fact_ratio,            cls: "text-blue-600 dark:text-blue-400" },
              { label: "Threat signal",      value: article.ai_threat_signal,         cls: "text-red-600 dark:text-red-400" },
              { label: "Context score",      value: article.ai_context_score,         cls: "text-green-600 dark:text-green-400" },
              { label: "Sensationalism",     value: article.ai_sensationalism,        cls: "text-amber-600 dark:text-amber-400" },
              { label: "Vulnerable risk",    value: article.ai_vulnerable_group_risk, cls: "text-red-600 dark:text-red-400" },
            ].filter(s => s.value != null).map(s => (
              <div key={s.label} className="flex justify-between items-center py-1 border-b border-dashed">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <span className={`font-mono text-sm font-semibold tabular-nums ${s.cls}`}>{(s.value as number).toFixed(3)}</span>
              </div>
            ))}
          </div>
          {article.human_framing != null && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Human review comparison</p>
              <div className="flex gap-6">
                {[
                  { label: "AI framing", value: article.ai_framing_direction?.toFixed(3) ?? "—", cls: "" },
                  { label: "Human avg",  value: article.human_framing.toFixed(3), cls: "" },
                  { label: "Delta",      value: Math.abs((article.ai_framing_direction ?? 0) - article.human_framing).toFixed(3), cls: Math.abs((article.ai_framing_direction ?? 0) - article.human_framing) > 0.3 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400" },
                  { label: "Reviews",    value: String(article.review_count), cls: "" },
                ].map(d => (
                  <div key={d.label}>
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className={`font-mono text-sm font-semibold ${d.cls}`}>{d.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {article.url && (
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              Read original article <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ArticleComparison({ articles }: { articles: ClusterArticle[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("publication_datetime")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const sorted = useMemo(() => {
    return [...articles].sort((a, b) => {
      const av = (a[sortKey] ?? 0) as any
      const bv = (b[sortKey] ?? 0) as any
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [articles, sortKey, sortDir])
  const btns: { key: SortKey; label: string }[] = [
    { key: "publication_datetime",  label: "Date" },
    { key: "ai_framing_direction",  label: "Framing" },
    { key: "ai_language_intensity", label: "Intensity" },
    { key: "ai_fact_ratio",         label: "Fact ratio" },
  ]
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-0.5">Article Comparison</p>
        <p className="text-xs text-muted-foreground">
          {articles.length} article{articles.length !== 1 ? "s" : ""} in this cluster. Click any to expand its full signal breakdown.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Sort by</span>
        {btns.map(b => (
          <button key={b.key}
            onClick={() => { if (sortKey === b.key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(b.key); setSortDir(b.key === "publication_datetime" ? "asc" : "desc") } }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${sortKey === b.key ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-background hover:bg-muted text-muted-foreground"}`}>
            {b.label} {sortKey === b.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {sorted.map((a, i) => <ArticleCard key={a.id} article={a} index={i} />)}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7 — Evolution Timeline
// ─────────────────────────────────────────────────────────────────────────────

function EvolutionTimeline({ data }: { data: ClusterIntelligence }) {
  if (!data.has_timeline) return null
  return (
    <div className="rounded-xl border bg-card shadow-sm p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold mb-0.5">Narrative Evolution</p>
        <p className="text-xs text-muted-foreground leading-relaxed">How framing and intensity shifted as this story developed.</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data.timeline} margin={{ top: 5, right: 20, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={v => { try { return format(parseISO(v), "d MMM") } catch { return v } }} angle={-30} textAnchor="end" />
          <YAxis domain={[-1, 1]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
          <Tooltip {...ttStyle}
            labelFormatter={v => { try { return format(parseISO(v as string), "d MMMM yyyy") } catch { return v as string } }}
            formatter={(val: number, name: string) => [val.toFixed(3), name === "avg_framing" ? "Avg framing" : "Avg intensity"]} />
          <Line type="monotone" dataKey="avg_framing"   stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="avg_framing" />
          <Line type="monotone" dataKey="avg_intensity" stroke="hsl(38 92% 50%)"         strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="avg_intensity" />
        </LineChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Article volume per day</p>
        <ResponsiveContainer width="100%" height={56}>
          <BarChart data={data.timeline} margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
            <XAxis hide /><YAxis hide />
            <Tooltip {...ttStyle} formatter={(v: number) => [v, "Articles"]} />
            <Bar dataKey="article_count" fill="hsl(var(--primary))" opacity={0.4} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NarrativeIntelligencePage() {
  const { clusterId } = useParams<{ clusterId: string }>()
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const isLoggedIn    = !!user
  const { isFree, ready } = useFreeCluster()

  const [data,    setData]    = useState<ClusterIntelligence | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [gated,   setGated]   = useState(false)

  useEffect(() => {
    if (!clusterId) { setError("No cluster ID provided"); setLoading(false); return }
    if (!ready) return
    if (!isLoggedIn && !isFree(clusterId)) { setGated(true); setLoading(false); return }
    getClusterIntelligence(clusterId)
      .then(r => { if (!r) setError("Cluster not found"); else setData(r) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [clusterId, isLoggedIn, isFree, ready])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 lg:px-6 lg:py-8 space-y-4">

      <button onClick={() => navigate("/clusters")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Observatory
      </button>

      {gated && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-10 flex flex-col items-center text-center gap-5">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2 max-w-sm">
            <p className="text-base font-semibold">Sign up to read this story</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Create a free account to access all story clusters, narrative arcs, publisher silence maps, and framing analysis.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/signup")} className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition">Sign up free</button>
            <button onClick={() => navigate("/login")} className="px-5 py-2.5 rounded-lg border text-sm font-medium text-muted-foreground hover:text-foreground transition">Log in</button>
          </div>
          <button onClick={() => navigate("/clusters")} className="text-xs text-muted-foreground hover:text-foreground transition hover:underline underline-offset-4">Browse free stories</button>
        </div>
      )}

      {loading && <div className="flex items-center justify-center min-h-[50vh]"><RotatingLoader /></div>}

      {error && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          {error}
        </div>
      )}

      {data && (
        <>
          <StoryIdentity data={data} />
          <NarrativeArcBlock identity={data.identity} articles={data.articles} />
          <NarrativeLandscape articles={data.articles} />
          <CoverageMap stats={data.publisher_stats} silent={data.identity.publishers_silent} />
          <NarrativeSignals data={data} />
          <ArticleComparison articles={data.articles} />
          <EvolutionTimeline data={data} />
          <div className="flex justify-between items-center py-4 border-t text-xs text-muted-foreground font-mono">
            <span>SCRY Narrative Observatory</span>
            <span>{clusterId?.slice(0, 12).toUpperCase()}</span>
            <span>{data.identity.article_count} signals</span>
          </div>
        </>
      )}

      {data && (
        <div className="rounded-xl border bg-muted/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">Explore more stories</p>
            <p className="text-xs text-muted-foreground">See how other stories are being covered across 13 Indian publishers.</p>
          </div>
          <button onClick={() => navigate("/clusters")} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition whitespace-nowrap shrink-0">
            Browse all stories <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

    </div>
  )
}
