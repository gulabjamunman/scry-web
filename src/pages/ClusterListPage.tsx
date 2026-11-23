import { useEffect, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow, parseISO } from "date-fns"
import { Search, ChevronRight, ChevronDown, Clock, Layers, Radio, Eye, VolumeX, Lock, Flame } from "lucide-react"
import { getRecentClusters, getTrendingClusters, getMajorClusters, type ClusterListItem } from "@/lib/api"
import LifecycleBadge from "@/components/LifecycleBadge"
import { useAuth } from "@/lib/auth"
import { useFreeCluster } from "@/contexts/FreeClusterContext"

const TOPICS = [
  "All", "Politics", "Economy", "Defence", "Foreign Policy",
  "Crime", "Environment", "Health", "Technology", "Social Issues", "Business", "Judiciary",
]

const TOPIC_COLORS: Record<string, string> = {
  Politics:         "text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30",
  Economy:          "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30",
  Defence:          "text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30",
  "Foreign Policy": "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30",
  Crime:            "text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-900 bg-pink-50 dark:bg-pink-950/30",
  Environment:      "text-green-600 dark:text-green-400 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30",
  Health:           "text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30",
  Technology:       "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30",
  "Social Issues":  "text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30",
  Business:         "text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/30",
  Judiciary:        "text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/30",
}

function FramingChip({ value }: { value: number | null }) {
  if (value == null) return null
  const label = value < -0.2 ? "Left" : value > 0.2 ? "Right" : "Neutral"
  const cls = value < -0.2
    ? "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
    : value > 0.2
    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
    : "text-muted-foreground border-border bg-muted/40"
  return <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>{label}</span>
}

function SilenceChip({ count }: { count: number }) {
  if (count === 0) return null
  const cls = count >= 12
    ? "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
    : count >= 8
    ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
    : "text-muted-foreground border-border bg-muted/40"
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium flex items-center gap-1 ${cls}`}>
      <VolumeX className="h-2.5 w-2.5" />{count} silent
    </span>
  )
}

// Inline signup prompt shown when a locked cluster is clicked
function SignupPrompt({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border rounded-2xl p-8 max-w-sm w-full space-y-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="space-y-2 text-center">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <p className="text-base font-semibold">Sign up to read all stories</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Create a free account to access all story clusters, narrative arcs, and publisher silence maps.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate("/signup")}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            Sign up free
          </button>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-2.5 rounded-lg border text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            Log in
          </button>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition pt-1">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}

function ClusterCard({ cluster, locked }: { cluster: ClusterListItem; locked: boolean }) {
  const navigate = useNavigate()
  const [showPrompt, setShowPrompt] = useState(false)
  const topicCls = cluster.dominant_topic
    ? (TOPIC_COLORS[cluster.dominant_topic] ?? "text-muted-foreground border-border bg-muted/40")
    : null

  function handleClick() {
    if (locked) { setShowPrompt(true); return }
    navigate(`/cluster/${cluster.id}`)
  }

  const age = cluster.last_seen
    ? formatDistanceToNow(parseISO(cluster.last_seen), { addSuffix: true })
    : "—"

  return (
    <>
      {showPrompt && <SignupPrompt onClose={() => setShowPrompt(false)} />}
      <button
        onClick={handleClick}
        className={`w-full text-left rounded-xl border bg-card shadow-sm transition-colors group ${
          locked ? "opacity-60 hover:opacity-80" : "hover:bg-muted/30"
        }`}
      >
        <div className="p-5 flex items-start gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <LifecycleBadge lifecycle={cluster.importance_tier ? cluster.lifecycle : null} />
              {cluster.is_active && !cluster.importance_tier && (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Live
                </span>
              )}
              {cluster.dominant_topic && topicCls && (
                <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${topicCls}`}>
                  {cluster.dominant_topic}
                </span>
              )}
              <FramingChip value={cluster.avg_framing_direction} />
              <SilenceChip count={cluster.silent_count} />
              {locked && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                  <Lock className="h-3 w-3" /> Sign up to read
                </span>
              )}
            </div>
            <p className={`text-sm font-semibold leading-snug ${locked ? "" : "group-hover:text-primary transition-colors"}`}>
              {cluster.title}
            </p>
            {!locked && cluster.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{cluster.summary}</p>
            )}
            <div className="flex items-center gap-4 flex-wrap pt-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3 w-3" />{cluster.article_count} article{cluster.article_count !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />{cluster.publisher_count} publisher{cluster.publisher_count !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />{age}
              </span>
              {!locked && cluster.avg_intensity != null && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Intensity</span>
                  <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.round(cluster.avg_intensity * 100)}%` }} />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">{cluster.avg_intensity.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
          {!locked && <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors" />}
        </div>
      </button>
    </>
  )
}

export default function ClusterListPage({ trending = false }: { trending?: boolean }) {
  const { user }           = useAuth()
  const isLoggedIn         = !!user
  const { isFree, ready } = useFreeCluster()

  const [clusters, setClusters] = useState<ClusterListItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [topic,    setTopic]    = useState("All")

  const [rawClusters, setRawClusters] = useState<ClusterListItem[]>([])
  // "major" shows only the stories the pipeline ranks as major news right now.
  const [view,       setView]       = useState<"major" | "all">("major")
  const [majorReady, setMajorReady] = useState(false)
  const [showSoft,   setShowSoft]   = useState(false)

  // Fetch clusters
  useEffect(() => {
    setLoading(true)
    const load = async () => {
      if (!trending && view === "major") {
        const major = await getMajorClusters()
        if (major && major.length > 0) { setMajorReady(true); return major }
        setView("all")                      // ranking not set up yet: show everything
        return null
      }
      return (trending ? getTrendingClusters : getRecentClusters)(200)
    }
    load()
      .then(rows => { if (rows) setRawClusters(rows) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [trending, view])

  // Sort: free clusters first — runs when clusters, ready, or isFree change
  useEffect(() => {
    if (!ready) return
    if (view === "major" && !trending) { setClusters(rawClusters); return }   // already ranked by importance
    const sorted = [...rawClusters].sort((a, b) => {
      const af = isFree(a.id) ? 0 : 1
      const bf = isFree(b.id) ? 0 : 1
      if (af !== bf) return af - bf
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
    })
    setClusters(sorted)
  }, [rawClusters, ready, isFree, view, trending])

  const filtered = useMemo(() => clusters.filter(c => {
    const matchTopic  = topic === "All" || c.dominant_topic === topic
    const matchSearch = !search.trim() ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.summary ?? "").toLowerCase().includes(search.toLowerCase())
    return matchTopic && matchSearch
  }), [clusters, topic, search])

  const isLocked = (c: ClusterListItem) => !isLoggedIn && !isFree(c.id)
  const showingMajor = view === "major" && !trending
  const hardNews = showingMajor ? filtered.filter(c => c.importance_tier !== "major_soft") : filtered
  const softNews = showingMajor ? filtered.filter(c => c.importance_tier === "major_soft") : []

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 lg:px-6 space-y-6">

      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          {trending ? <Radio className="h-5 w-5 text-primary" /> : <Layers className="h-5 w-5 text-primary" />}
          <h1 className="text-xl font-bold tracking-tight">
            {trending ? "Trending Stories" : "Intelligence Observatory"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {trending
            ? "Active story clusters ranked by coverage volume in the last 72 hours."
            : showingMajor
            ? "The biggest stories right now: covered by many outlets, still moving, and on Google News' top stories."
            : "Story clusters observed across 17 Indian news publishers."
          }
        </p>
        {!isLoggedIn && (
          <p className="text-xs text-primary font-medium pt-1">
            2 stories free to read · Sign up to unlock all
          </p>
        )}
        {!loading && (
          <p className="text-xs text-muted-foreground font-mono">
            {showingMajor ? `${clusters.length} major stories` : `${clusters.length} clusters indexed`}
          </p>
        )}
      </div>

      {/* Major / all switch */}
      {!trending && majorReady && (
        <div className="inline-flex rounded-lg border bg-card p-0.5 text-xs">
          {([["major", "Major now"], ["all", "All stories"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                view === v ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "major" && <Flame className="h-3 w-3" />}{label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 transition">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search stories…"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground text-base leading-none transition-colors">×</button>
        )}
      </div>

      {/* Topic pills */}
      <div className="flex flex-wrap gap-2">
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
          Loading clusters…
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-2">
          <p className="text-muted-foreground text-sm">No clusters match current filters.</p>
          {(search || topic !== "All") && (
            <button onClick={() => { setSearch(""); setTopic("All") }} className="text-xs text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Cluster list */}
      {!loading && hardNews.length > 0 && (
        <div className="space-y-2">
          {hardNews.map(c => (
            <ClusterCard key={c.id} cluster={c} locked={isLocked(c)} />
          ))}
        </div>
      )}

      {/* Sport, entertainment and business: their own collapsed lane */}
      {!loading && softNews.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowSoft(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSoft ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Sport, entertainment and business ({softNews.length})
          </button>
          {showSoft && softNews.map(c => (
            <ClusterCard key={c.id} cluster={c} locked={isLocked(c)} />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="text-center text-xs text-muted-foreground pt-4 border-t font-mono">
          SCRY Narrative Observatory · {filtered.length} clusters · 17 publishers monitored
        </div>
      )}
    </div>
  )
}
