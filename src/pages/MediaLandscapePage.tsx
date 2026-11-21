import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart, Line, BarChart, Bar,
  Cell, Legend,
} from "recharts"
import { format, parseISO, startOfWeek } from "date-fns"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Article {
  publisher_name:         string
  topic:                  string | null
  ai_framing_direction:   number | null
  ai_language_intensity:  number | null
  ai_sensationalism:      number | null
  ai_emotional_intensity: number | null
  publication_datetime:   string | null
  story_cluster_id:       string | null
}

interface ClusterMeta {
  id:             string
  title:          string | null
  dominant_topic: string | null
}

interface PublisherDot {
  publisher: string
  framing:   number
  intensity: number
  count:     number
  color:     string
}

interface BoxDatum {
  publisher: string
  min:    number; q1: number; median: number; q3: number; max: number
  color:  string
}

interface TimePoint {
  week:           string
  sensationalism: number
  emotion:        number
  count:          number
  topClusters:    { title: string; topic: string | null; avgSens: number }[]
}

interface TopicShareRow {
  publisher: string
  [topic: string]: number | string
}

type TabId = "narrative" | "framing" | "emotion" | "topics"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; description: string }[] = [
  { id: "narrative", label: "Narrative Map",          description: "Outlet positioning by average framing direction and language intensity" },
  { id: "framing",   label: "Topic Framing",          description: "How different outlets frame the same topic" },
  { id: "emotion",   label: "Sensationalism Tracker", description: "Emotional intensity and sensationalism spikes over time" },
  { id: "topics",    label: "Topic Distribution",     description: "Editorial priorities — which outlets emphasise which issues" },
]

const TOPIC_LIST = [
  "Politics", "Economy", "Defence", "Social Issues", "Judiciary",
  "Environment", "Health", "Technology", "Foreign Policy", "Education",
  "Media", "Sports & Culture",
]

const PUB_COLORS: Record<string, string> = {
  "Times of India":  "hsl(290, 70%, 60%)",
  "News18":          "hsl(25,  90%, 55%)",
  "Swarajya":        "hsl(0,   70%, 55%)",
  "OpIndia":         "hsl(0,   85%, 45%)",
  "India TV News":   "hsl(30,  85%, 55%)",
  "NDTV":            "hsl(215, 70%, 58%)",
  "National Herald": "hsl(260, 55%, 58%)",
  "Scroll.in":       "hsl(195, 75%, 45%)",
  "The Quint":       "hsl(205, 70%, 52%)",
  "The Hindu":       "hsl(155, 55%, 42%)",
  "Indian Express":  "hsl(160, 50%, 48%)",
  "BBC India":       "hsl(45,  90%, 48%)",
  "DW Asia":         "hsl(50,  80%, 50%)",
}

const TOPIC_COLORS = [
  "hsl(145, 60%, 42%)", "hsl(215, 50%, 65%)", "hsl(30, 90%, 55%)",
  "hsl(0, 50%, 65%)",   "hsl(0, 85%, 48%)",   "hsl(260, 55%, 60%)",
  "hsl(195, 75%, 45%)", "hsl(45, 90%, 48%)",  "hsl(80, 55%, 45%)",
  "hsl(320, 60%, 55%)",
]

const pubColor = (name: string) => PUB_COLORS[name] ?? "hsl(0, 0%, 60%)"

// ─────────────────────────────────────────────────────────────────────────────
// Maths helpers
// ─────────────────────────────────────────────────────────────────────────────

const mean = (arr: number[]) =>
  arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

const quantile = (sorted: number[], q: number) => {
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function boxStats(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  return { min: s[0], q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[s.length - 1] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Recharts tooltip style
// ─────────────────────────────────────────────────────────────────────────────

const ttProps = {
  contentStyle: {
    background: "hsl(var(--card))",
    border:     "1px solid hsl(var(--border))",
    borderRadius: 8, fontSize: 12,
    color: "hsl(var(--foreground))",
  },
  itemStyle:  { color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher dot — uses initials for inline label, full name in tooltip
// ─────────────────────────────────────────────────────────────────────────────

function PublisherDotShape(props: { cx?: number; cy?: number; payload?: PublisherDot }) {
  const { cx = 0, cy = 0, payload } = props
  if (!payload) return null
  const r = Math.max(7, Math.min(18, Math.sqrt(payload.count) * 1.4))
  const words = payload.publisher.split(" ")
  const label = words.length > 2
    ? words.map(w => w[0]).join("")           // initials: "Times of India" → "ToI"
    : words[0]                                // first word: "NDTV" → "NDTV"
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={payload.color} fillOpacity={0.15}
        stroke={payload.color} strokeWidth={1.5} />
      <text x={cx} y={cy - r - 4} textAnchor="middle" fill={payload.color}
        fontSize={9} fontWeight={700}>
        {label}
      </text>
    </g>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Box plot shape
// ─────────────────────────────────────────────────────────────────────────────

function BoxShape(props: {
  x?: number; y?: number; width?: number
  background?: { y: number; height: number }; payload?: BoxDatum
}) {
  const { x = 0, width = 0, payload, background } = props
  if (!payload || !background) return null
  const toY = (v: number) => background.y + background.height * (1 - (v + 1) / 2)
  const yMin = toY(Math.max(-1, payload.min)), yQ1 = toY(payload.q1)
  const yMed = toY(payload.median), yQ3 = toY(payload.q3), yMax = toY(Math.min(1, payload.max))
  const cx = x + width / 2, bw = Math.max(12, width * 0.5), c = payload.color
  return (
    <g>
      <line x1={cx} y1={yMin} x2={cx} y2={yQ1} stroke={c} strokeWidth={1} strokeDasharray="3 2" />
      <line x1={cx} y1={yQ3} x2={cx} y2={yMax} stroke={c} strokeWidth={1} strokeDasharray="3 2" />
      <rect x={cx - bw / 2} y={yQ3} width={bw} height={Math.max(1, yQ1 - yQ3)}
        fill={c} fillOpacity={0.15} stroke={c} strokeWidth={1.2} rx={2} />
      <line x1={cx - bw / 2} y1={yMed} x2={cx + bw / 2} y2={yMed} stroke={c} strokeWidth={2.5} />
      <line x1={cx - bw / 4} y1={yMin} x2={cx + bw / 4} y2={yMin} stroke={c} strokeWidth={1.5} />
      <line x1={cx - bw / 4} y1={yMax} x2={cx + bw / 4} y2={yMax} stroke={c} strokeWidth={1.5} />
    </g>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensationalism tooltip — shows full publisher name + top stories for that week
// ─────────────────────────────────────────────────────────────────────────────

function SensTooltip({ active, payload, label, timeData }: any) {
  if (!active || !payload?.length) return null
  const point = (timeData as TimePoint[]).find(d => d.week === label)
  const dateLabel = (() => {
    try { return `Week of ${format(parseISO(label), "d MMM yyyy")}` } catch { return label }
  })()
  return (
    <div className="rounded-lg border bg-card shadow-lg p-3 text-xs space-y-2"
      style={{ maxWidth: 260, pointerEvents: "none" }}>
      <p className="font-semibold text-foreground">{dateLabel}</p>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-3">
            <span style={{ color: p.color }}>
              {p.dataKey === "sensationalism" ? "Sensationalism" : "Emotion"}
            </span>
            <span className="font-mono font-semibold">{Number(p.value).toFixed(3)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 text-muted-foreground">
          <span>Articles</span>
          <span className="font-mono">{point?.count ?? "—"}</span>
        </div>
      </div>
      {point?.topClusters && point.topClusters.length > 0 && (
        <div className="pt-2 border-t space-y-1.5">
          <p className="text-muted-foreground font-semibold uppercase tracking-wider" style={{ fontSize: 10 }}>
            Top stories driving this
          </p>
          {point.topClusters.map((c, i) => (
            <div key={i} className="space-y-0.5">
              <p className="text-foreground leading-snug" style={{ fontSize: 11 }}>
                {c.title.length > 55 ? c.title.slice(0, 55) + "…" : c.title}
              </p>
              <div className="flex items-center gap-2 text-muted-foreground">
                {c.topic && <span>{c.topic}</span>}
                <span className="font-mono" style={{ color: "hsl(0, 75%, 52%)" }}>
                  sens {c.avgSens.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartWrapper — handles the overflow-x-auto + minWidth pattern for mobile
// ─────────────────────────────────────────────────────────────────────────────

function ChartWrapper({ minWidth = 340, height, children }: {
  minWidth?: number; height: number; children: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
      <div style={{ minWidth }}>
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MediaLandscapePage() {
  const [articles,    setArticles]    = useState<Article[]>([])
  const [clusters,    setClusters]    = useState<ClusterMeta[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState<TabId>("narrative")
  const [activeTopic, setActiveTopic] = useState("Defence")

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const PAGE = 1000
    let all: Article[] = []

    async function fetchArticles(from: number) {
      const { data } = await supabase
        .from("articles")
        .select([
          "publisher_name", "topic", "ai_framing_direction", "ai_language_intensity",
          "ai_sensationalism", "ai_emotional_intensity", "publication_datetime", "story_cluster_id",
        ].join(", "))
        .eq("processed", true)
        .eq("analysis_skipped", false)
        .not("ai_framing_direction", "is", null)
        .order("publication_datetime", { ascending: true })
        .range(from, from + PAGE - 1)
      if (data && data.length > 0) {
        all = [...all, ...(data as Article[])]
        if (data.length === PAGE) await fetchArticles(from + PAGE)
      }
    }

    async function fetchClusters() {
      // Fetch ALL clusters in pages — no title filter, so articles whose cluster
      // has a null title still get a useful fallback label (dominant_topic)
      const PAGE = 1000
      let allClusters: ClusterMeta[] = []
      let from = 0
      while (true) {
        const { data } = await supabase
          .from("story_clusters")
          .select("id, title, dominant_topic")
          .order("last_seen", { ascending: false })
          .range(from, from + PAGE - 1)
        if (!data || data.length === 0) break
        allClusters = [...allClusters, ...(data as ClusterMeta[])]
        if (data.length < PAGE) break
        from += PAGE
      }
      setClusters(allClusters)
    }

    Promise.all([fetchArticles(0), fetchClusters()]).then(() => {
      setArticles(all)
      setLoading(false)
    })
  }, [])

  // ── Narrative Map ──────────────────────────────────────────────────────────
  const narrativeData = useMemo<PublisherDot[]>(() => {
    const map: Record<string, { f: number[]; i: number[] }> = {}
    articles.forEach(a => {
      if (!a.publisher_name || a.ai_framing_direction == null || a.ai_language_intensity == null) return
      if (!map[a.publisher_name]) map[a.publisher_name] = { f: [], i: [] }
      map[a.publisher_name].f.push(a.ai_framing_direction)
      map[a.publisher_name].i.push(a.ai_language_intensity)
    })
    return Object.entries(map).map(([pub, v]) => ({
      publisher: pub,
      framing:   parseFloat(mean(v.f).toFixed(3)),
      intensity: parseFloat(mean(v.i).toFixed(3)),
      count:     v.f.length,
      color:     pubColor(pub),
    }))
  }, [articles])

  // ── Topic Framing ──────────────────────────────────────────────────────────
  const topicFramingData = useMemo<BoxDatum[]>(() => {
    const map: Record<string, number[]> = {}
    articles.forEach(a => {
      if (a.topic !== activeTopic || a.ai_framing_direction == null || !a.publisher_name) return
      if (!map[a.publisher_name]) map[a.publisher_name] = []
      map[a.publisher_name].push(a.ai_framing_direction)
    })
    return Object.entries(map)
      .filter(([, v]) => v.length >= 3)
      .map(([pub, v]) => ({ publisher: pub, ...boxStats(v), color: pubColor(pub) }))
      .sort((a, b) => a.median - b.median)
  }, [articles, activeTopic])

  // ── Sensationalism time series with cluster context ────────────────────────
  const { timeData, spikeThreshold } = useMemo(() => {
    const clusterLookup: Record<string, ClusterMeta> = {}
    clusters.forEach(c => { clusterLookup[c.id] = c })

    const weekMap: Record<string, {
      s: number[]; e: number[]; n: number
      clusterSens: Record<string, number[]>
    }> = {}

    articles.forEach(a => {
      if (!a.publication_datetime) return
      try {
        const week = format(startOfWeek(parseISO(a.publication_datetime), { weekStartsOn: 1 }), "yyyy-MM-dd")
        if (!weekMap[week]) weekMap[week] = { s: [], e: [], n: 0, clusterSens: {} }
        if (a.ai_sensationalism    != null) weekMap[week].s.push(a.ai_sensationalism)
        if (a.ai_emotional_intensity != null) weekMap[week].e.push(a.ai_emotional_intensity)
        weekMap[week].n++
        if (a.story_cluster_id && a.ai_sensationalism != null) {
          if (!weekMap[week].clusterSens[a.story_cluster_id]) weekMap[week].clusterSens[a.story_cluster_id] = []
          weekMap[week].clusterSens[a.story_cluster_id].push(a.ai_sensationalism)
        }
      } catch { /* skip */ }
    })

    const timeData: TimePoint[] = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => {
        const topClusters = Object.entries(v.clusterSens)
          .map(([cid, vals]) => {
            const meta = clusterLookup[cid]
            // Title first, then topic as fallback, skip entirely if neither
            const title = meta?.title ?? (meta?.dominant_topic ? `[${meta.dominant_topic} story]` : null)
            if (!title) return null
            return { title, topic: meta?.dominant_topic ?? null, avgSens: mean(vals) }
          })
          .filter((x): x is { title: string; topic: string | null; avgSens: number } => x !== null)
          .sort((a, b) => b.avgSens - a.avgSens)
          .slice(0, 3)
        return {
          week,
          sensationalism: parseFloat(mean(v.s).toFixed(3)),
          emotion:        parseFloat(mean(v.e).toFixed(3)),
          count:          v.n,
          topClusters,
        }
      })

    const vals = timeData.map(d => d.sensationalism)
    const m    = mean(vals)
    const std  = vals.length ? Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length) : 0
    const spikeThreshold = parseFloat((m + 1.5 * std).toFixed(3))

    return { timeData, spikeThreshold }
  }, [articles, clusters])

  // ── Topic Distribution ─────────────────────────────────────────────────────
  const { topicDistData, topTopics } = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    articles.forEach(a => {
      if (!a.publisher_name || !a.topic) return
      if (!map[a.publisher_name]) map[a.publisher_name] = {}
      map[a.publisher_name][a.topic] = (map[a.publisher_name][a.topic] ?? 0) + 1
    })
    const totals: Record<string, number> = {}
    Object.values(map).forEach(pm =>
      Object.entries(pm).forEach(([t, c]) => { totals[t] = (totals[t] ?? 0) + c })
    )
    const topTopics = Object.entries(totals).sort(([, a], [, b]) => b - a).slice(0, 8).map(([t]) => t)
    const topicDistData: TopicShareRow[] = Object.entries(map)
      .map(([pub, counts]) => {
        const total = Object.values(counts).reduce((s, c) => s + c, 0)
        const row: TopicShareRow = { publisher: pub.split(" ")[0] }
        topTopics.forEach(t => { row[t] = total > 0 ? parseFloat(((counts[t] ?? 0) / total * 100).toFixed(1)) : 0 })
        return row
      })
      .sort((a, b) => String(a.publisher).localeCompare(String(b.publisher)))
    return { topicDistData, topTopics }
  }, [articles])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Media Landscape</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Narrative patterns across{" "}
            <span className="font-semibold text-foreground">{articles.length.toLocaleString()}</span>{" "}
            analyzed articles
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {Object.entries(PUB_COLORS).map(([pub, color]) => (
            <span key={pub} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              {pub}
            </span>
          ))}
        </div>
      </div>

      {/* Tab bar — scrollable on mobile */}
      <div className="border-b -mx-4 px-4 lg:mx-0 lg:px-0 overflow-x-auto">
        <nav className="flex gap-0 -mb-px min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={[
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <p className="text-sm text-muted-foreground">
        {TABS.find(t => t.id === activeTab)?.description}
      </p>

      {loading && (
        <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
          Loading data…
        </div>
      )}

      {!loading && (
        <>
          {/* ═══════════════ 1. NARRATIVE MAP ═══════════════ */}
          {activeTab === "narrative" && (
            <div className="rounded-xl border bg-card shadow-sm p-4 lg:p-6 space-y-5">
              <p className="text-xs text-muted-foreground">
                Bubble size reflects article volume. Hover any bubble for the full publisher name and scores.
                Centre lines divide left/right and calm/charged quadrants.
              </p>
              {narrativeData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No framing data yet.
                </div>
              ) : (
                <ChartWrapper height={380} minWidth={340}>
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="framing" domain={[-1, 1]} tick={{ fontSize: 10 }}
                      label={{ value: "← Left    Framing Direction    Right →", position: "insideBottom", offset: -30, fontSize: 10 }} />
                    <YAxis type="number" dataKey="intensity" domain={[0, 1]} tick={{ fontSize: 10 }}
                      label={{ value: "Intensity", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <ZAxis type="number" dataKey="count" range={[150, 1400]} />
                    <ReferenceLine x={0}   stroke="hsl(var(--border))" strokeDasharray="5 3" />
                    <ReferenceLine y={0.5} stroke="hsl(var(--border))" strokeDasharray="5 3" />
                    <Tooltip
                      {...ttProps}
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const d = payload[0].payload as PublisherDot
                        return (
                          <div className="rounded-lg border bg-card shadow-md p-3 text-xs space-y-1" style={{ minWidth: 160 }}>
                            {/* Full publisher name shown here */}
                            <div className="font-semibold text-sm mb-2" style={{ color: d.color }}>{d.publisher}</div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Framing</span><span className="font-medium">{d.framing.toFixed(3)}</span></div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Intensity</span><span className="font-medium">{d.intensity.toFixed(3)}</span></div>
                            <div className="flex justify-between gap-4 pt-1 border-t"><span className="text-muted-foreground">Articles</span><span className="font-medium">{d.count}</span></div>
                          </div>
                        )
                      }}
                    />
                    <Scatter data={narrativeData} shape={<PublisherDotShape />} />
                  </ScatterChart>
                </ChartWrapper>
              )}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Left + Charged",   desc: "Activist / advocacy framing",   color: "hsl(215, 50%, 65%)" },
                  { label: "Right + Charged",  desc: "Nationalist / alarmist framing", color: "hsl(0, 50%, 65%)"   },
                  { label: "Left + Measured",  desc: "Analytical / policy framing",    color: "hsl(145, 60%, 42%)" },
                  { label: "Right + Measured", desc: "Conservative / institutional",   color: "hsl(30, 90%, 55%)"  },
                ].map(q => (
                  <div key={q.label} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: q.color }} />
                    <div>
                      <div className="text-xs font-semibold">{q.label}</div>
                      <div className="text-xs text-muted-foreground hidden sm:block">{q.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════════════ 2. TOPIC FRAMING ═══════════════ */}
          {activeTab === "framing" && (
            <div className="rounded-xl border bg-card shadow-sm p-4 lg:p-6 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Select Topic</div>
                <div className="flex flex-wrap gap-2">
                  {TOPIC_LIST.map(t => (
                    <button key={t} onClick={() => setActiveTopic(t)}
                      className={[
                        "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                        activeTopic === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground",
                      ].join(" ")}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Box = interquartile range · Line = median · Whiskers = min/max · Requires ≥3 articles per outlet
              </p>
              {topicFramingData.length < 2 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Not enough data for "{activeTopic}" yet — need ≥3 articles per outlet.
                </div>
              ) : (
                <ChartWrapper height={380} minWidth={Math.max(340, topicFramingData.length * 60)}>
                  <BarChart data={topicFramingData} margin={{ top: 20, right: 20, bottom: 65, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="publisher" tick={{ fontSize: 10, angle: -35, textAnchor: "end" }} interval={0} />
                    <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }}
                      label={{ value: "Framing Direction", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 3" />
                    <Tooltip
                      {...ttProps}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const d = payload[0].payload as BoxDatum
                        return (
                          <div className="rounded-lg border bg-card shadow-md p-3 text-xs space-y-1" style={{ minWidth: 170 }}>
                            <div className="font-semibold text-sm mb-2" style={{ color: d.color }}>{d.publisher}</div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Median</span><span className="font-medium">{d.median.toFixed(3)}</span></div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground">IQR</span><span className="font-medium">{d.q1.toFixed(3)} → {d.q3.toFixed(3)}</span></div>
                            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Range</span><span className="font-medium">{d.min.toFixed(3)} → {d.max.toFixed(3)}</span></div>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="median" shape={<BoxShape />} isAnimationActive={false}>
                      {topicFramingData.map((_, i) => <Cell key={i} fill="transparent" />)}
                    </Bar>
                  </BarChart>
                </ChartWrapper>
              )}
            </div>
          )}

          {/* ═══════════════ 3. SENSATIONALISM TRACKER ═══════════════ */}
          {activeTab === "emotion" && (
            <div className="rounded-xl border bg-card shadow-sm p-4 lg:p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Weekly averages across all outlets. Dashed line marks spike threshold (mean + 1.5σ).
                Hover any point to see which stories drove that week's sensationalism level.
              </p>
              {timeData.length < 4 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Need more articles with timestamps to render the timeline.
                </div>
              ) : (
                <>
                  <ChartWrapper height={300} minWidth={340}>
                    <LineChart data={timeData} margin={{ top: 10, right: 20, bottom: 50, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 9, angle: -45, textAnchor: "end" }}
                        interval="preserveStartEnd"
                        tickFormatter={v => { try { return format(parseISO(v), "d MMM") } catch { return v } }} />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                      <ReferenceLine y={spikeThreshold} stroke="hsl(0, 85%, 48%)"
                        strokeDasharray="6 3" strokeWidth={1.5}
                        label={{ value: `spike >${spikeThreshold}`, fill: "hsl(0, 85%, 48%)", fontSize: 9, position: "insideTopRight" }} />
                      <Tooltip content={(props) => <SensTooltip {...props} timeData={timeData} />} />
                      <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }}
                        formatter={v => v === "sensationalism" ? "Avg Sensationalism" : "Avg Emotional Intensity"} />
                      <Line type="monotone" dataKey="sensationalism" stroke="hsl(0, 85%, 48%)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="emotion" stroke="hsl(215, 50%, 65%)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ChartWrapper>

                  {/* Summary stats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Peak Sensationalism", value: Math.max(...timeData.map(d => d.sensationalism)).toFixed(3), sub: timeData.reduce((a, b) => a.sensationalism > b.sensationalism ? a : b).week },
                      { label: "Avg Sensationalism",  value: mean(timeData.map(d => d.sensationalism)).toFixed(3), sub: "across all weeks" },
                      { label: "Spike Weeks",         value: timeData.filter(d => d.sensationalism > spikeThreshold).length, sub: `above ${spikeThreshold}` },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border bg-muted/30 px-3 py-2.5">
                        <div className="text-xs text-muted-foreground leading-tight">{s.label}</div>
                        <div className="text-lg font-bold mt-0.5 tabular-nums">{s.value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Spike stories panel — top stories from the highest spike week */}
                  {(() => {
                    const spikeWeeks = timeData
                      .filter(d => d.sensationalism > spikeThreshold)
                      .sort((a, b) => b.sensationalism - a.sensationalism)
                    if (spikeWeeks.length === 0) return null
                    return (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold">Stories driving sensationalism spikes</h3>
                        {spikeWeeks.slice(0, 3).map(week => {
                          if (week.topClusters.length === 0) return null
                          const weekLabel = (() => { try { return format(parseISO(week.week), "d MMM yyyy") } catch { return week.week } })()
                          return (
                            <div key={week.week} className="rounded-lg border bg-card p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  Week of {weekLabel}
                                </p>
                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                                  sens {week.sensationalism.toFixed(3)}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {week.topClusters.map((c, i) => (
                                  <div key={i} className="flex items-start gap-3">
                                    <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0 mt-0.5">
                                      <span className="text-xs font-bold text-red-600 dark:text-red-400">{i + 1}</span>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium leading-snug">{c.title}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        {c.topic && <span className="text-xs text-muted-foreground">{c.topic}</span>}
                                        <span className="text-xs font-mono text-red-600 dark:text-red-400">
                                          avg sens {c.avgSens.toFixed(2)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </>
              )}
            </div>
          )}

          {/* ═══════════════ 4. TOPIC DISTRIBUTION ═══════════════ */}
          {activeTab === "topics" && (
            <div className="rounded-xl border bg-card shadow-sm p-4 lg:p-6 space-y-4">
              <p className="text-xs text-muted-foreground">
                Each bar shows the share of articles per topic for that outlet.
                Reveals editorial priorities — which outlets emphasise which issues.
              </p>
              {topicDistData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  No topic data yet.
                </div>
              ) : (
                <>
                  <ChartWrapper height={380} minWidth={Math.max(340, topicDistData.length * 55)}>
                    <BarChart data={topicDistData} margin={{ top: 10, right: 20, bottom: 65, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="publisher" tick={{ fontSize: 10, angle: -35, textAnchor: "end" }} interval={0} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                      <Tooltip {...ttProps} formatter={(v: number, name: string) => [`${v}%`, name]} />
                      <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10, paddingBottom: 8 }} />
                      {topTopics.map((topic, i) => (
                        <Bar key={topic} dataKey={topic} stackId="a"
                          fill={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                          radius={i === topTopics.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ChartWrapper>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {topTopics.map((topic, i) => {
                      const total = topicDistData.reduce((s, r) => s + (Number(r[topic]) || 0), 0)
                      return (
                        <div key={topic} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] }} />
                          <span className="truncate">{topic}</span>
                          <span className="ml-auto font-medium text-foreground">{total.toFixed(0)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
