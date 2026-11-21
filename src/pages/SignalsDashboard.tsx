import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow, parseISO } from "date-fns"
import {
  TrendingUp, Radio, EyeOff, Clock,
  Newspaper, RefreshCw, Filter, AlertCircle,
  X, ChevronRight, Info,
} from "lucide-react"
import { getRecentClusters, type ClusterListItem } from "@/lib/api"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_PUBLISHERS = 17

const TOPICS = [
  "All", "Politics", "Economy", "Defence", "Foreign Policy",
  "Crime", "Environment", "Health", "Technology", "Social Issues",
  "Business", "Judiciary",
]

// ─────────────────────────────────────────────────────────────────────────────
// Spike score computation
// ─────────────────────────────────────────────────────────────────────────────

function computeSpikeScore(cluster: ClusterListItem): number {
  const first = new Date(cluster.first_seen ?? cluster.last_seen ?? Date.now())
  const last  = new Date(cluster.last_seen  ?? Date.now())
  // Use 0.5h floor instead of 1h — single articles at t=0 get velocity=2 not 1,
  // but we filter article_count < 2 downstream so this only affects real clusters
  const hours = Math.max((last.getTime() - first.getTime()) / 3_600_000, 0.5)
  const velocity      = cluster.article_count / hours
  const undercoverage = (cluster.silent_count ?? 0) / TOTAL_PUBLISHERS
  return +(velocity * (1 + undercoverage)).toFixed(3)
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal explanation — this is the core of what makes signals trustworthy.
// Plain English reasoning for why each signal is flagged.
// ─────────────────────────────────────────────────────────────────────────────

function buildSignalReason(cluster: ClusterListItem & { spike: number }): {
  headline: string
  detail:   string
  type:     "velocity" | "silence" | "both"
} {
  const hours = Math.max(
    (new Date(cluster.last_seen).getTime() - new Date(cluster.first_seen).getTime()) / 3_600_000,
    1
  )
  const velocity      = cluster.article_count / hours
  const silentCount   = cluster.silent_count ?? 0
  const coveringCount = cluster.publisher_count ?? 0
  const silentNames   = (cluster.publishers_silent ?? []).slice(0, 3).join(", ")
  const coveringNames = (cluster.publishers ?? []).slice(0, 2).join(", ")

  const isVelocity = velocity > 0.15
  const isSilence  = silentCount >= 3

  if (isVelocity && isSilence) {
    return {
      type:     "both",
      headline: `${coveringCount} publishers surged on this in ${Math.round(hours)}h — but ${silentCount} said nothing`,
      detail:   `${coveringNames} and others have published ${cluster.article_count} articles in ${Math.round(hours)} hours. Meanwhile, ${silentNames}${silentCount > 3 ? ` and ${silentCount - 3} more` : ""} have not covered it at all. Rapid coverage concentration with significant silence is a reliable indicator of editorial divergence — not just a trending topic.`,
    }
  }

  if (isSilence) {
    return {
      type:     "silence",
      headline: `${silentCount} of ${TOTAL_PUBLISHERS} publishers are not covering this`,
      detail:   `Only ${coveringCount} publisher${coveringCount !== 1 ? "s" : ""} have covered this story. ${silentNames}${silentCount > 3 ? ` and ${silentCount - 3} others` : ""} have not published anything on it. When a significant portion of the press skips a story — especially one others are actively covering — it often reflects editorial choices worth examining.`,
    }
  }

  if (isVelocity) {
    return {
      type:     "velocity",
      headline: `${cluster.article_count} articles in ${Math.round(hours)}h — unusually fast for this story`,
      detail:   `This story accumulated ${cluster.article_count} articles across ${coveringCount} publishers in ${Math.round(hours)} hours. At ${velocity.toFixed(1)} articles per hour, that's a faster rate than most stories at this stage. Velocity alone signals something is pulling editorial attention — even before we understand why.`,
    }
  }

  return {
    type:     "velocity",
    headline: `${cluster.article_count} articles across ${coveringCount} publishers`,
    detail:   `This story is active across ${coveringCount} publishers with ${cluster.article_count} articles so far. It is being tracked because its combination of coverage spread and recency puts it above baseline for this topic area.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────────────────────

function SpikeChip({ score }: { score: number }) {
  const cls = score > 0.8
    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
    : score > 0.3
    ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
    : "text-muted-foreground border-border bg-muted/40"
  const text = score > 0.8 ? "Rapid spike" : score > 0.3 ? "Rising" : "Steady"
  return (
    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      <TrendingUp className="h-2.5 w-2.5" />
      {text}
    </span>
  )
}

function SilenceChip({ count }: { count: number }) {
  if (!count) return null
  const cls = count >= 10
    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
    : count >= 5
    ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
    : "text-muted-foreground border-border bg-muted/40"
  return (
    <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      <EyeOff className="h-2.5 w-2.5" />
      {count} silent
    </span>
  )
}

function FramingChip({ value }: { value: number | null }) {
  if (value == null) return null
  const label = value < -0.2 ? "Left lean" : value > 0.2 ? "Right lean" : "Neutral"
  const cls   = value < -0.2
    ? "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
    : value > 0.2
    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
    : "text-muted-foreground border-border bg-muted/40"
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal detail drawer — the full explanation + arc + action
// ─────────────────────────────────────────────────────────────────────────────

const ARC_LABELS: Record<string, string> = {
  origin:        "Origin",
  propagation:   "How it spread",
  fault_lines:   "Fault lines",
  silences:      "Silences",
  current_state: "Current state",
}

function SignalDrawer({
  cluster,
  onClose,
}: {
  cluster: (ClusterListItem & { spike: number }) | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  if (!cluster) return null

  const reason        = buildSignalReason(cluster)
  const arc           = (cluster as any).narrative_arc
  const silentPubs    = cluster.publishers_silent ?? []
  const coveringPubs  = cluster.publishers ?? []
  const hours         = Math.max(
    (new Date(cluster.last_seen).getTime() - new Date(cluster.first_seen).getTime()) / 3_600_000,
    1
  )

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="relative ml-auto h-full w-full max-w-lg bg-background border-l shadow-xl overflow-y-auto">
        <div className="p-6 space-y-6">

          {/* Close */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Signal detail
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {cluster.is_active && (
                <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
              <SpikeChip score={cluster.spike} />
              <FramingChip value={cluster.avg_framing_direction ?? null} />
              <SilenceChip count={cluster.silent_count ?? 0} />
            </div>
            <h2 className="text-lg font-bold tracking-tight leading-snug">
              {cluster.title}
            </h2>
            {cluster.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {cluster.summary}
              </p>
            )}
          </div>

          {/* Why this signal — the key trust-building section */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Why this is flagged
              </p>
            </div>
            <p className="text-sm font-medium leading-snug">
              {reason.headline}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {reason.detail}
            </p>

            {/* Signal score breakdown */}
            <div className="pt-2 border-t space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                How we compute this
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-background border p-3 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Velocity</p>
                  <p className="text-sm font-semibold font-mono">
                    {(cluster.article_count / hours).toFixed(1)}/hr
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {cluster.article_count} articles in {Math.round(hours)}h
                  </p>
                </div>
                <div className="rounded-lg bg-background border p-3 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Silence ratio</p>
                  <p className="text-sm font-semibold font-mono">
                    {Math.round(((cluster.silent_count ?? 0) / TOTAL_PUBLISHERS) * 100)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {cluster.silent_count ?? 0} of {TOTAL_PUBLISHERS} publishers silent
                  </p>
                </div>
                <div className="rounded-lg bg-background border p-3 space-y-0.5 col-span-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Signal score</p>
                  <p className="text-sm font-semibold font-mono">{cluster.spike.toFixed(3)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    velocity × (1 + silence ratio) — higher means more unusual
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Coverage breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Coverage breakdown
            </p>

            {coveringPubs.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Covering</p>
                <div className="flex flex-wrap gap-1.5">
                  {coveringPubs.map(p => (
                    <span
                      key={p}
                      className="text-xs px-2 py-0.5 rounded-lg border bg-muted/30 text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {silentPubs.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Not covering</p>
                <div className="flex flex-wrap gap-1.5">
                  {silentPubs.map(p => (
                    <span
                      key={p}
                      className="text-xs px-2 py-0.5 rounded-lg border border-dashed border-border text-muted-foreground/60"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Narrative arc */}
          {arc && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Narrative arc
              </p>
              <div className="space-y-2">
                {Object.entries(ARC_LABELS).map(([key, label]) => {
                  const section = arc[key]
                  if (!section?.text) return null
                  return (
                    <div key={key} className="rounded-lg border bg-card p-3 space-y-1">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-primary">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {section.text}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-lg border divide-y text-xs font-mono">
            {[
              { label: "First seen",    value: formatDistanceToNow(parseISO(cluster.first_seen), { addSuffix: true }) },
              { label: "Last activity", value: formatDistanceToNow(parseISO(cluster.last_seen),  { addSuffix: true }) },
              { label: "Articles",      value: String(cluster.article_count) },
              { label: "Sources",       value: `${cluster.publisher_count} / ${TOTAL_PUBLISHERS}` },
              ...(cluster.dominant_topic ? [{ label: "Topic", value: cluster.dominant_topic }] : []),
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-3 py-2">
                <span className="text-muted-foreground">{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => { onClose(); navigate(`/cluster/${cluster.id}`) }}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition"
          >
            Open full intelligence file
            <ChevronRight className="h-4 w-4" />
          </button>

        </div>
      </aside>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Signal card — opens drawer instead of navigating directly
// ─────────────────────────────────────────────────────────────────────────────

function SignalCard({
  cluster,
  rank,
  onSelect,
}: {
  cluster: ClusterListItem & { spike: number }
  rank?:   number
  onSelect: (c: ClusterListItem & { spike: number }) => void
}) {
  const reason = buildSignalReason(cluster)
  const age    = cluster.last_seen
    ? formatDistanceToNow(parseISO(cluster.last_seen), { addSuffix: true })
    : "—"

  return (
    <button
      onClick={() => onSelect(cluster)}
      className="w-full text-left rounded-xl border bg-card hover:bg-muted/30 transition-colors group shadow-sm"
    >
      <div className="p-5 space-y-3">

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {cluster.is_active && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          <SpikeChip score={cluster.spike} />
          <FramingChip value={cluster.avg_framing_direction ?? null} />
          <SilenceChip count={cluster.silent_count ?? 0} />
          {rank != null && rank <= 3 && (
            <span className="text-xs font-mono text-muted-foreground/50">#{rank}</span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
          {cluster.title}
        </p>

        {/* Signal reason — one line of plain English */}
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
          {reason.headline}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-wrap pt-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Newspaper className="h-3 w-3" />
            {cluster.article_count} article{cluster.article_count !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="h-3 w-3" />
            {cluster.publisher_count} source{cluster.publisher_count !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {age}
          </span>
          <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
            ↑ {cluster.spike.toFixed(2)}
          </span>
        </div>

        {/* Publisher dots */}
        {(cluster.publishers ?? []).length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {(cluster.publishers ?? []).slice(0, 12).map((p: string) => (
              <span
                key={p}
                title={p}
                className="h-5 w-5 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-mono text-muted-foreground uppercase"
              >
                {p.charAt(0)}
              </span>
            ))}
            {(cluster.publishers_silent ?? []).slice(0, 5).map((p: string) => (
              <span
                key={p}
                title={`${p} — not covering`}
                className="h-5 w-5 rounded-full border border-dashed border-border flex items-center justify-center text-[9px] font-mono text-muted-foreground/40 uppercase"
              >
                {p.charAt(0)}
              </span>
            ))}
          </div>
        )}

      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground font-mono px-2">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function SignalsDashboard() {
  const [clusters,   setClusters]   = useState<ClusterListItem[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [topic,      setTopic]      = useState("All")
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [selected,   setSelected]   = useState<(ClusterListItem & { spike: number }) | null>(null)

  async function fetchClusters() {
    try {
      setRefreshing(true)
      const data = await getRecentClusters(100)
      setClusters(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.message ?? "Failed to load signals")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchClusters()
    const interval = setInterval(fetchClusters, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const withSpike = useMemo(() =>
    clusters
      .map(c => ({ ...c, spike: computeSpikeScore(c) }))
      // Filter single-article clusters — they are noise at low scrape volume
      // and produce artificially high velocity scores due to the hours floor
      .filter(c => c.article_count >= 2)
      .filter(c => topic === "All" || c.dominant_topic === topic)
      .sort((a, b) => b.spike - a.spike),
  [clusters, topic])

  const top       = withSpike.slice(0, 3)
  const rising    = withSpike.slice(3, 9)
  const remaining = withSpike.slice(9)

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 py-8 lg:px-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold tracking-tight">Signals</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Unusual story movements across {TOTAL_PUBLISHERS} Indian publishers, ranked by velocity and undercoverage.
            </p>
            {!loading && (
              <p className="text-xs text-muted-foreground font-mono">
                {withSpike.length} active signals
                {lastUpdate && ` · updated ${formatDistanceToNow(lastUpdate, { addSuffix: true })}`}
              </p>
            )}
          </div>
          <button
            onClick={fetchClusters}
            disabled={refreshing}
            className="shrink-0 p-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Topic filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                topic === t
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Scanning signals…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            {error}
            <button onClick={fetchClusters} className="ml-auto text-xs text-primary hover:underline">
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && withSpike.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <p className="text-muted-foreground text-sm">
              No active signals{topic !== "All" ? ` in ${topic}` : ""}.
            </p>
            {topic !== "All" && (
              <button onClick={() => setTopic("All")} className="text-xs text-primary hover:underline">
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Top signals */}
        {!loading && !error && top.length > 0 && (
          <div className="space-y-3">
            <SectionDivider label={`${top.length} top signal${top.length !== 1 ? "s" : ""}`} />
            <div className="space-y-2">
              {top.map((c, i) => (
                <SignalCard key={c.id} cluster={c} rank={i + 1} onSelect={setSelected} />
              ))}
            </div>
          </div>
        )}

        {/* Rising */}
        {!loading && !error && rising.length > 0 && (
          <div className="space-y-3">
            <SectionDivider label={`${rising.length} rising`} />
            <div className="space-y-2">
              {rising.map(c => (
                <SignalCard key={c.id} cluster={c} onSelect={setSelected} />
              ))}
            </div>
          </div>
        )}

        {/* Remaining */}
        {!loading && !error && remaining.length > 0 && (
          <div className="space-y-3">
            <SectionDivider label={`${remaining.length} more active`} />
            <div className="space-y-2">
              {remaining.map(c => (
                <SignalCard key={c.id} cluster={c} onSelect={setSelected} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && withSpike.length > 0 && (
          <div className="text-center text-xs text-muted-foreground pt-4 border-t font-mono">
            SCRY Signals · {withSpike.length} clusters · {TOTAL_PUBLISHERS} publishers monitored
          </div>
        )}

      </div>

      {/* Signal detail drawer */}
      {selected && (
        <SignalDrawer cluster={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
