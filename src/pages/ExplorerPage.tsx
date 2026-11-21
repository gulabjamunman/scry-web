import { useEffect, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { format, parseISO } from "date-fns"
import {
  Search, SlidersHorizontal, X, ChevronLeft,
  ChevronRight, Loader, ArrowUpDown, ChevronDown, Check,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Article } from "@/lib/types"
import { mapArticle } from "@/lib/api"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = "publication_datetime" | "ai_framing_direction" | "ai_language_intensity" | "ai_fact_ratio" | "ai_threat_signal" | "ai_sensationalism"
type SortDir   = "asc" | "desc"
type Leaning   = "all" | "left" | "center" | "right"

interface Filters {
  search:       string
  publisher:    string
  topic:        string
  leaning:      Leaning
  sortField:    SortField
  sortDir:      SortDir
  onlyAnalyzed: boolean
  onlyReviewed: boolean
}

const DEFAULT_FILTERS: Filters = {
  search:       "",
  publisher:    "all",
  topic:        "all",
  leaning:      "all",
  sortField:    "publication_datetime",
  sortDir:      "desc",
  onlyAnalyzed: false,
  onlyReviewed: false,
}

const PAGE_SIZE = 24

const TOPICS = [
  "Politics", "Economy", "Defence", "Foreign Policy", "Crime",
  "Environment", "Health", "Technology", "Sports", "Entertainment",
  "Social Issues", "Business", "Judiciary",
]

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "publication_datetime",  label: "Date"           },
  { value: "ai_framing_direction",  label: "Framing"        },
  { value: "ai_language_intensity", label: "Intensity"      },
  { value: "ai_fact_ratio",         label: "Fact ratio"     },
  { value: "ai_threat_signal",      label: "Threat signal"  },
  { value: "ai_sensationalism",     label: "Sensationalism" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Debounce
// ─────────────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch all publishers once — paginated to bypass Supabase 1000-row limit
// ─────────────────────────────────────────────────────────────────────────────

async function fetchAllPublishers(): Promise<string[]> {
  const PAGE = 1000
  let offset = 0
  const seen = new Set<string>()
  while (true) {
    const { data, error } = await supabase
      .from("articles")
      .select("publisher_name")
      .eq("processed", true)
      .not("ai_context_score", "is", null)
      .range(offset, offset + PAGE - 1)
      .order("publisher_name")
    if (error || !data || data.length === 0) break
    data.forEach((r: any) => { if (r.publisher_name) seen.add(r.publisher_name) })
    if (data.length < PAGE) break
    offset += PAGE
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b))
}

// ─────────────────────────────────────────────────────────────────────────────
// Article fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchArticles(filters: Filters, page: number): Promise<{ articles: Article[]; total: number }> {
  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1
  let query = supabase
    .from("articles")
    .select(`
      id, headline, publisher_name, publication_datetime, url, topic,
      processed, ai_framing_direction, ai_language_intensity,
      ai_fact_ratio, ai_threat_signal, ai_sensationalism,
      ai_context_score, ai_vulnerable_group_risk,
      political_leaning, author_byline,
      human_reviews!human_reviews_article_id_fkey(count)
    `, { count: "exact" })
    .eq("processed", true)
    .not("ai_context_score", "is", null)

  if (filters.search.trim()) {
    query = query.or(`headline.ilike.%${filters.search.trim()}%,publisher_name.ilike.%${filters.search.trim()}%`)
  }
  if (filters.publisher !== "all") query = query.eq("publisher_name", filters.publisher)
  if (filters.topic     !== "all") query = query.eq("topic", filters.topic)
  if (filters.leaning === "left")   query = query.lt("ai_framing_direction", -0.2)
  if (filters.leaning === "right")  query = query.gt("ai_framing_direction",  0.2)
  if (filters.leaning === "center") {
    query = query.gte("ai_framing_direction", -0.2).lte("ai_framing_direction", 0.2)
  }
  if (filters.onlyReviewed) {
    // Only articles that have at least one human review
    query = query.gt("review_count", 0)
  }

  query = query.order(filters.sortField, { ascending: filters.sortDir === "asc" }).range(from, to)
  const { data, error, count } = await query
  if (error) throw error
  const articles = (data || []).map((row: any) => {
    const reviewCount = Array.isArray(row.human_reviews) && row.human_reviews.length > 0
      ? Number(row.human_reviews[0].count) || 0 : 0
    return mapArticle({ ...row, review_count: reviewCount })
  })
  return { articles, total: count ?? 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom publisher dropdown — replaces broken native size={8} listbox
// ─────────────────────────────────────────────────────────────────────────────

function PublisherSelect({
  publishers,
  value,
  onChange,
}: {
  publishers: string[]
  value:      string
  onChange:   (v: string) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const filtered = publishers.filter(p =>
    p.toLowerCase().includes(search.toLowerCase())
  )

  const displayLabel = value === "all" ? "All publishers" : value

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-left"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] rounded-lg border bg-card shadow-lg overflow-hidden">
          {/* Search within dropdown */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Search publishers…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-md border bg-background pl-6 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          {/* Scrollable list */}
          <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
            {[{ label: "All publishers", val: "all" }, ...filtered.map(p => ({ label: p, val: p }))].map(item => (
              <button
                key={item.val}
                type="button"
                onClick={() => { onChange(item.val); setOpen(false); setSearch("") }}
                className={[
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors",
                  value === item.val ? "bg-primary/8 text-primary font-medium" : "text-foreground",
                ].join(" ")}
              >
                <Check className={`h-3 w-3 shrink-0 ${value === item.val ? "opacity-100 text-primary" : "opacity-0"}`} />
                {item.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No publishers match</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Framing bar
// ─────────────────────────────────────────────────────────────────────────────

function FramingBar({ value }: { value: number | null }) {
  if (value == null) return null
  const pct   = ((value + 1) / 2) * 100
  const label = value < -0.2 ? "Left" : value > 0.2 ? "Right" : "Neutral"
  const color = value < -0.2 ? "bg-blue-500" : value > 0.2 ? "bg-red-500" : "bg-muted-foreground/40"
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-px h-full bg-border" />
        </div>
        <div className={`absolute top-0 h-full w-1 rounded-full ${color}`} style={{ left: `calc(${pct}% - 2px)` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground tabular-nums">
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </span>
      <span className={`text-xs font-medium ${
        value < -0.2 ? "text-blue-600 dark:text-blue-400"
        : value > 0.2 ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground"
      }`}>{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Score pill
// ─────────────────────────────────────────────────────────────────────────────

function ScorePill({ label, value, warn }: { label: string; value: number | null; warn?: boolean }) {
  if (value == null) return null
  const high = warn ? value > 0.6 : false
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-mono tabular-nums ${
      high
        ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
        : "text-muted-foreground border-border bg-muted/40"
    }`}>
      {label} {Math.round(value * 100)}%
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Article card
// ─────────────────────────────────────────────────────────────────────────────

function ArticleRow({ article }: { article: Article }) {
  const navigate = useNavigate()
  return (
    <div
      className="rounded-xl border bg-card shadow-sm hover:bg-muted/20 transition-colors cursor-pointer group"
      onClick={() => navigate(`/article/${article.id}`)}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-primary truncate">{article.publisher}</span>
            {article.topic && (
              <>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-xs text-muted-foreground truncate">{article.topic}</span>
              </>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground shrink-0">
            {article.date ? format(parseISO(article.date), "d MMM yyyy") : "—"}
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {article.headline}
        </p>
        {(article as any).author_byline && (
          <p className="text-xs text-muted-foreground">By {(article as any).author_byline}</p>
        )}
        <FramingBar value={article.aiFramingDirection ?? null} />
        <div className="flex flex-wrap gap-1.5">
          <ScorePill label="Intensity" value={article.aiLanguageIntensity ?? null} warn />
          <ScorePill label="Fact"      value={article.aiFactRatio         ?? null} />
          <ScorePill label="Context"   value={article.aiContextScore      ?? null} />
          {(article.reviewCount ?? 0) > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium">
              {article.reviewCount} review{article.reviewCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Active filter chips
// ─────────────────────────────────────────────────────────────────────────────

function ActiveFilters({
  filters, onChange, onClear,
}: {
  filters: Filters; onChange: (f: Partial<Filters>) => void; onClear: () => void
}) {
  const chips: { label: string; key: keyof Filters; value: any }[] = []
  if (filters.publisher !== "all") chips.push({ label: filters.publisher,           key: "publisher",    value: "all"  })
  if (filters.topic     !== "all") chips.push({ label: filters.topic,               key: "topic",        value: "all"  })
  if (filters.leaning   !== "all") chips.push({ label: `Leaning: ${filters.leaning}`, key: "leaning",    value: "all"  })
  if (filters.onlyAnalyzed)        chips.push({ label: "Analyzed only",             key: "onlyAnalyzed", value: false  })
  if (filters.onlyReviewed)        chips.push({ label: "Reviewed only",             key: "onlyReviewed", value: false  })
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Active filters:</span>
      {chips.map(c => (
        <button key={c.key} onClick={() => onChange({ [c.key]: c.value })}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border bg-primary/10 border-primary/30 text-primary font-medium hover:bg-primary/20 transition-colors">
          {c.label}<X className="h-3 w-3" />
        </button>
      ))}
      <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Clear all
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ExplorerPage() {
  const [filters,     setFilters]     = useState<Filters>(DEFAULT_FILTERS)
  const [searchInput, setSearchInput] = useState("")
  const [page,        setPage]        = useState(0)
  const [articles,    setArticles]    = useState<Article[]>([])
  const [total,       setTotal]       = useState(0)
  const [publishers,  setPublishers]  = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const debouncedSearch = useDebounce(searchInput, 350)

  // Fetch publisher list once on mount — completely independent of filters
  useEffect(() => {
    fetchAllPublishers().then(setPublishers)
  }, [])

  // Sync debounced search
  useEffect(() => {
    setFilters(f => ({ ...f, search: debouncedSearch }))
    setPage(0)
  }, [debouncedSearch])

  // Fetch articles on filter/page change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchArticles(filters, page)
      .then(({ articles, total }) => {
        if (cancelled) return
        setArticles(articles)
        setTotal(total)
      })
      .catch(e => { if (!cancelled) setError(e.message ?? "Failed to load articles") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filters, page])

  function updateFilters(partial: Partial<Filters>) {
    setFilters(f => ({ ...f, ...partial }))
    setPage(0)
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setSearchInput("")
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasFilters = (
    filters.publisher !== "all" || filters.topic !== "all" ||
    filters.leaning !== "all"   || filters.onlyAnalyzed || filters.onlyReviewed
  )

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:px-6 space-y-6">

      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Article Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Search and filter across analyzed articles from {publishers.length} publishers.
        </p>
      </div>

      {/* Search + sort + filter toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {loading && searchInput && (
            <Loader className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
          <input
            type="text"
            placeholder="Search headlines or publishers…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full rounded-lg border bg-card pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground transition"
          />
          {searchInput && (
            <button onClick={() => { setSearchInput(""); updateFilters({ search: "" }) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={filters.sortField}
            onChange={e => updateFilters({ sortField: e.target.value as SortField })}
            className="rounded-lg border bg-card px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => updateFilters({ sortDir: filters.sortDir === "asc" ? "desc" : "asc" })}
            className="p-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors"
            title={filters.sortDir === "asc" ? "Ascending" : "Descending"}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={() => setShowFilters(s => !s)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors shrink-0 ${
            showFilters || hasFilters
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {hasFilters && (
            <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
              {[filters.publisher !== "all", filters.topic !== "all", filters.leaning !== "all", filters.onlyAnalyzed, filters.onlyReviewed].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Topic pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => updateFilters({ topic: "all" })}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
            filters.topic === "all"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
          }`}>
          All
        </button>
        {TOPICS.map(t => (
          <button key={t}
            onClick={() => updateFilters({ topic: filters.topic === t ? "all" : t })}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
              filters.topic === t
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

            {/* Publisher — custom scrollable dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Publisher</label>
              <PublisherSelect
                publishers={publishers}
                value={filters.publisher}
                onChange={v => updateFilters({ publisher: v })}
              />
            </div>

            {/* Leaning */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Framing</label>
              <select
                value={filters.leaning}
                onChange={e => updateFilters({ leaning: e.target.value as Leaning })}
                className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="all">All framings</option>
                <option value="left">Left-leaning</option>
                <option value="center">Neutral</option>
                <option value="right">Right-leaning</option>
              </select>
            </div>

          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t">
            <span className="text-xs text-muted-foreground self-center">Show only:</span>
            <button
              onClick={() => updateFilters({ onlyReviewed: !filters.onlyReviewed })}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors font-medium ${
                filters.onlyReviewed
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Human reviewed
            </button>
          </div>
        </div>
      )}

      <ActiveFilters filters={filters} onChange={updateFilters} onClear={clearFilters} />

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-mono">
          {loading ? "Loading…" : `${total.toLocaleString()} article${total !== 1 ? "s" : ""}${hasFilters || filters.search ? " — filtered" : ""}`}
        </p>
        {totalPages > 1 && (
          <p className="text-xs text-muted-foreground font-mono">Page {page + 1} of {totalPages}</p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border bg-card p-6 text-sm text-destructive text-center">{error}</div>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-full" />
              <div className="h-4 bg-muted rounded w-4/5" />
              <div className="h-2 bg-muted rounded w-1/2 mt-2" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && articles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 space-y-2">
          <p className="text-muted-foreground text-sm">No articles match your search.</p>
          {(hasFilters || filters.search) && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline">Clear filters</button>
          )}
        </div>
      )}

      {!loading && !error && articles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map(a => <ArticleRow key={a.id} article={a} />)}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4 border-t">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter(i => Math.abs(i - page) <= 3 || i === 0 || i === totalPages - 1)
              .reduce<(number | "…")[]>((acc, i, idx, arr) => {
                if (idx > 0 && (i as number) - (arr[idx - 1] as number) > 1) acc.push("…")
                acc.push(i)
                return acc
              }, [])
              .map((item, idx) =>
                item === "…"
                  ? <span key={`e-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                  : <button key={item} onClick={() => setPage(item as number)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition-colors ${
                        page === item ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground hover:text-foreground"
                      }`}>
                      {(item as number) + 1}
                    </button>
              )
            }
          </div>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

    </div>
  )
}
