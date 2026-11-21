import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Telescope, Newspaper, BarChart3, Eye, ClipboardCheck, Radio } from "lucide-react"
import { supabase } from "@/lib/supabase"

interface Cluster {
  id: string
  title: string
  summary: string
  avg_framing_direction: number
  avg_language_intensity: number
  publisher_count: number
  silent_count: number
  article_count: number
  dominant_topic: string
  last_seen: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return "< 1h ago"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function framingLabel(v: number): { label: string; className: string } {
  if (v > 0.35)  return { label: "Right-leaning", className: "text-rose-600 dark:text-rose-400" }
  if (v < -0.35) return { label: "Left-leaning",  className: "text-sky-600 dark:text-sky-400" }
  return { label: "Neutral", className: "text-muted-foreground" }
}

function FramingBar({ value }: { value: number }) {
  const pct = ((value + 1) / 2) * 100
  const { label, className } = framingLabel(value)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-mono">Framing</span>
        <span className={`text-[10px] font-medium font-mono ${className}`}>{label}</span>
      </div>
      <div className="relative h-1 rounded-full bg-muted overflow-visible">
        <div className="absolute inset-y-0 left-0 w-1/2 rounded-l-full bg-gradient-to-r from-sky-200 to-transparent dark:from-sky-900 opacity-50" />
        <div className="absolute inset-y-0 right-0 w-1/2 rounded-r-full bg-gradient-to-l from-rose-200 to-transparent dark:from-rose-900 opacity-50" />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-foreground border-2 border-background shadow-sm"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function IntensityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const colorClass = value > 0.6 ? "bg-rose-400" : value > 0.35 ? "bg-amber-400" : "bg-emerald-400"
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground tracking-widest uppercase font-mono">Intensity</span>
        <span className="text-[10px] text-muted-foreground font-mono">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ClusterCard({ cluster, onClick }: { cluster: Cluster; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
      className="rounded-xl border bg-card hover:bg-muted/30 hover:border-border transition-all cursor-pointer flex flex-col gap-3 p-5 group"
    >
      <div className="space-y-1.5">
        <span className="text-[10px] font-mono tracking-widest uppercase text-primary font-medium">
          {cluster.dominant_topic || "News"}
        </span>
        <h3 className="text-sm font-semibold leading-snug line-clamp-2 tracking-tight">{cluster.title}</h3>
      </div>
      <FramingBar value={cluster.avg_framing_direction} />
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-1">
        <span><span className="font-semibold text-foreground">{cluster.publisher_count}</span> publishers</span>
        {cluster.silent_count > 0 && (
          <span className="text-amber-600 dark:text-amber-400 font-medium">· {cluster.silent_count} silent</span>
        )}
        <span className="ml-auto">{timeAgo(cluster.last_seen)}</span>
      </div>
    </div>
  )
}

const sections = [
  { title: "Article Explorer",  url: "/explorer",     icon: Newspaper,      tag: "Public",      tagClass: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",  featured: true,  description: "Browse every article with its full signal breakdown. Filter by publisher, topic, or date." },
  { title: "Intelligence",      url: "/clusters",     icon: Telescope,      tag: "Free preview", tagClass: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",  featured: false, description: "Narrative arcs, framing divergence, and silence maps for every active story." },
  { title: "Insights",          url: "/insights",     icon: BarChart3,      tag: "Public",      tagClass: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",  featured: false, description: "Corpus-wide distributions and publisher-level framing patterns." },
  { title: "Transparency",      url: "/transparency", icon: Eye,            tag: "Public",      tagClass: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",  featured: false, description: "Every formula, weight, and limitation documented publicly." },
  { title: "Become a Reviewer", url: "/reviewer",     icon: ClipboardCheck, tag: "Open to all", tagClass: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",       featured: false, description: "Score articles across five dimensions to help calibrate the model." },
]

export default function HomePage() {
  const navigate = useNavigate()

  const [clusters,      setClusters]      = useState<Cluster[]>([])
  const [storyOfDay,    setStoryOfDay]    = useState<Cluster | null>(null)
  const [articleCount,  setArticleCount]  = useState<number | null>(null)
  const [clusterCount,  setClusterCount]  = useState<number | null>(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { data } = await supabase
          .from("story_clusters")
          .select("id, title, summary, avg_framing_direction, avg_language_intensity, publisher_count, silent_count, article_count, dominant_topic, last_seen")
          .eq("is_active", true)
          .gte("last_seen", cutoff24h)
          .order("publisher_count", { ascending: false })
          .limit(8)

        if (data && data.length > 0) {
          setClusters(data)
          setStoryOfDay(data[0])
        }

        const [artRes, clsRes] = await Promise.all([
          supabase.from("articles").select("id", { count: "exact", head: true }),
          supabase.from("story_clusters").select("id", { count: "exact", head: true }).eq("is_active", true),
        ])
        setArticleCount(artRes.count)
        setClusterCount(clsRes.count)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const gridClusters = storyOfDay
    ? clusters.filter(c => c.id !== storyOfDay.id).slice(0, 4)
    : clusters.slice(0, 4)

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 lg:py-14 space-y-12">

      {/* Hero */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Telescope className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">SCRY</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-full px-2.5 py-0.5">
            <Radio className="h-2.5 w-2.5 text-green-500 animate-pulse" />
            <span>Live · 17 publishers · updated every 2h</span>
          </div>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
          Narrative intelligence<br />for Indian news media.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
          Framing direction, emotional charge, and coverage silences — measured across every story, every publisher, every day.
        </p>
        <div className="flex items-center gap-8 pt-1">
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight">{articleCount != null ? articleCount.toLocaleString() : "—"}</div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">Articles analysed</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight">{clusterCount != null ? clusterCount.toLocaleString() : "—"}</div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">Active stories</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums tracking-tight">17</div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-0.5">Publishers tracked</div>
          </div>
        </div>
      </div>

      {/* Story of the day */}
      {!loading && storyOfDay && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground font-medium">Story of the day</span>
            <div className="flex items-center gap-1.5 text-[10px] text-green-600 dark:text-green-400 font-mono">
              <Radio className="h-2.5 w-2.5 animate-pulse" />
              Widest coverage today
            </div>
          </div>
          <div
            onClick={() => navigate(`/cluster/${storyOfDay.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === "Enter" && navigate(`/cluster/${storyOfDay.id}`)}
            className="rounded-xl border bg-card hover:border-border hover:bg-muted/20 transition-all cursor-pointer group p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2 flex-1 min-w-0">
                <span className="text-[10px] font-mono tracking-widest uppercase text-primary font-medium">
                  {storyOfDay.dominant_topic || "News"}
                </span>
                <h2 className="text-xl font-semibold tracking-tight leading-snug">{storyOfDay.title}</h2>
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{storyOfDay.summary}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-5xl font-bold tabular-nums tracking-tight leading-none">{storyOfDay.publisher_count}</div>
                <div className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase mt-1">Publishers</div>
                {storyOfDay.silent_count > 0 && (
                  <div className="inline-block mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-0.5 font-mono">
                    {storyOfDay.silent_count} stayed silent
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <FramingBar value={storyOfDay.avg_framing_direction} />
              <IntensityBar value={storyOfDay.avg_language_intensity} />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary group-hover:underline underline-offset-4">
              Read narrative analysis <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="rounded-xl border bg-card p-6 space-y-4 animate-pulse">
          <div className="flex justify-between gap-6">
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-6 w-3/4 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
            <div className="h-16 w-12 rounded bg-muted shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="h-7 rounded bg-muted" />
            <div className="h-7 rounded bg-muted" />
          </div>
        </div>
      )}

      {/* Active stories grid */}
      {!loading && gridClusters.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground font-medium">Active stories</span>
            <button
              onClick={() => navigate("/clusters")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono hover:underline underline-offset-4"
            >
              View all →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gridClusters.map(cluster => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onClick={() => navigate(`/cluster/${cluster.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Grid skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3 animate-pulse">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-5 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Newsroom CTA */}
      <div className="rounded-xl border bg-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="space-y-1 flex-1">
          <h3 className="text-sm font-semibold tracking-tight">Built for newsrooms</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            Real-time narrative intelligence for editors, journalists, and researchers. Surface blind spots before they become editorial problems.
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <button
            onClick={() => navigate("/signup")}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Sign up free <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate("/clusters")}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors whitespace-nowrap"
          >
            See a live example
          </button>
        </div>
      </div>

      {/* Explore */}
      <div className="space-y-3">
        <span className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground font-medium">Explore</span>
        <div className="flex flex-col gap-3">
          {sections.map(section => (
            <button
              key={section.url}
              onClick={() => navigate(section.url)}
              className={`w-full text-left rounded-xl border p-5 transition-all group ${
                section.featured
                  ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                  : "bg-card hover:bg-muted/30 hover:border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg border p-1.5 mt-0.5 shrink-0 transition-colors ${section.featured ? "bg-primary/10 border-primary/20 group-hover:border-primary/40" : "bg-muted/50 group-hover:border-primary/30"}`}>
                  <section.icon className={`h-3.5 w-3.5 transition-colors ${section.featured ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{section.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${section.tagClass}`}>{section.tag}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{section.description}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-xs text-muted-foreground leading-relaxed border-t pt-8 space-y-1">
        <p>SCRY is an independent research project — not affiliated with any publisher, political party, or funding organisation.</p>
        <p>Questions or collaboration: <span className="text-foreground">hello@scry.in</span></p>
      </div>

    </div>
  )
}
