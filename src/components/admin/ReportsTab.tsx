// ============================================================
// src/components/admin/ReportsTab.tsx
// ============================================================

import { useEffect, useState, useCallback } from "react"
import { formatDistanceToNow, parseISO } from "date-fns"
import {
  FileText, ToggleLeft, ToggleRight, Loader,
  RefreshCw, ExternalLink, Trash2, Eye, CheckCircle,
} from "lucide-react"
import { supabase } from "@/lib/supabase"

interface BriefCache {
  generated_at:       string
  publisher_excerpts: any[]
}

interface ReportCluster {
  id:              string
  title:           string | null
  summary:         string | null
  article_count:   number
  publisher_count: number
  last_seen:       string
  report_enabled:  boolean
  report_cache:    BriefCache | null
  dominant_topic:  string | null
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────

function ClusterReportRow({
  cluster, onToggle, onClearCache, onBriefGenerated,
}: {
  cluster:          ReportCluster
  onToggle:         (id: string, val: boolean) => Promise<void>
  onClearCache:     (id: string) => Promise<void>
  onBriefGenerated: (id: string, brief: BriefCache) => void
}) {
  const [saving,     setSaving]     = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  async function handleToggle() {
    setSaving("toggle")
    try { await onToggle(cluster.id, !cluster.report_enabled) }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleClear() {
    setSaving("clear")
    try { await onClearCache(cluster.id) }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { data, error } = await supabase.functions.invoke("generate-brief", {
        body: { cluster_id: cluster.id, force_regenerate: true },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (data?.brief) onBriefGenerated(cluster.id, data.brief)
    } catch (e: any) {
      alert(`Generation failed: ${e.message}`)
    } finally {
      setGenerating(false)
    }
  }

  const hasCache     = !!cluster.report_cache
  const cacheAge     = hasCache ? formatDistanceToNow(parseISO(cluster.report_cache!.generated_at), { addSuffix: true }) : null
  const excerptCount = cluster.report_cache?.publisher_excerpts?.length ?? 0

  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${!cluster.report_enabled ? "opacity-70" : ""}`}>
      <div className="p-4 space-y-3">

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {cluster.dominant_topic && (
                <span className="text-xs px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground font-medium">
                  {cluster.dominant_topic}
                </span>
              )}
              {cluster.report_enabled && !hasCache && !generating && (
                <span className="text-xs px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium">
                  Export enabled · not yet generated
                </span>
              )}
              {hasCache && !generating && (
                <span className="text-xs px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Cached · {excerptCount} publishers · {cacheAge}
                </span>
              )}
              {generating && (
                <span className="text-xs px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <Loader className="h-3 w-3 animate-spin" />
                  Generating brief…
                </span>
              )}
            </div>
            <p className="text-sm font-semibold leading-snug">{cluster.title ?? "Untitled cluster"}</p>
            {cluster.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cluster.summary}</p>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-1.5">
              {cluster.article_count} articles · {cluster.publisher_count} publishers ·
              last seen {formatDistanceToNow(parseISO(cluster.last_seen), { addSuffix: true })}
            </p>
          </div>

          <button
            onClick={handleToggle}
            disabled={saving === "toggle" || generating}
            className={`flex items-center gap-1 text-xs font-medium transition-colors shrink-0 ${
              cluster.report_enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
            } disabled:opacity-40`}
          >
            {saving === "toggle"
              ? <Loader className="h-4 w-4 animate-spin" />
              : cluster.report_enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />
            }
            {cluster.report_enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        {cluster.report_enabled && !generating && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            {hasCache && (
              <a
                href={`/cluster/${cluster.id}/brief`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                <Eye className="h-3 w-3" />
                Preview brief
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            )}
            <button
              onClick={handleGenerate}
              disabled={!!saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors font-medium disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              {hasCache ? "Regenerate" : "Generate now"}
            </button>
            {hasCache && (
              <button
                onClick={handleClear}
                disabled={!!saving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Clear cache
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────

export function ReportsTab() {
  const [clusters, setClusters] = useState<ReportCluster[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")
  const [filter,   setFilter]   = useState<"all" | "enabled" | "cached">("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("story_clusters")
        .select("id, title, summary, article_count, publisher_count, last_seen, report_enabled, report_cache, dominant_topic")
        .order("last_seen", { ascending: false })
        .limit(200)
      if (!error && data) setClusters(data as ReportCluster[])
    } catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(id: string, val: boolean) {
    await supabase.from("story_clusters").update({ report_enabled: val }).eq("id", id)
    setClusters(cs => cs.map(c => c.id === id ? { ...c, report_enabled: val } : c))
  }

  async function handleClearCache(id: string) {
    await supabase.from("story_clusters").update({ report_cache: null }).eq("id", id)
    setClusters(cs => cs.map(c => c.id === id ? { ...c, report_cache: null } : c))
  }

  function handleBriefGenerated(id: string, brief: BriefCache) {
    setClusters(cs => cs.map(c => c.id === id ? { ...c, report_cache: brief } : c))
  }

  const filtered = clusters.filter(c => {
    if (filter === "enabled" && !c.report_enabled) return false
    if (filter === "cached"  && !c.report_cache)   return false
    if (search && !(c.title ?? "").toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const enabledCount = clusters.filter(c => c.report_enabled).length
  const cachedCount  = clusters.filter(c => c.report_cache).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" /> Narrative Briefs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enable export for specific clusters. Generation takes ~10 seconds and is cached permanently.
          </p>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{clusters.length} clusters total</span>
        <span className="text-green-600 dark:text-green-400 font-medium">{enabledCount} export-enabled</span>
        <span className="text-blue-600 dark:text-blue-400 font-medium">{cachedCount} cached</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "enabled", "cached"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clusters…"
          className="ml-auto rounded-lg border bg-card px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground w-52"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <Loader className="h-4 w-4 animate-spin" /> Loading clusters…
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No clusters match.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <ClusterReportRow
              key={c.id}
              cluster={c}
              onToggle={handleToggle}
              onClearCache={handleClearCache}
              onBriefGenerated={handleBriefGenerated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
