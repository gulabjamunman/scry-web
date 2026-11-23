// Shows where a major story is in its life: breaking, developing or settled.
// Values come from the pipeline's rank_stories.py.

const STYLES: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  breaking:   { label: "Breaking",   cls: "text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30", pulse: true },
  developing: { label: "Developing", cls: "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" },
  settled:    { label: "Settled",    cls: "text-muted-foreground border-border bg-muted/40" },
}

export default function LifecycleBadge({ lifecycle }: { lifecycle?: string | null }) {
  const s = lifecycle ? STYLES[lifecycle] : undefined
  if (!s) return null
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium flex items-center gap-1 ${s.cls}`}>
      {s.pulse && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
      {s.label}
    </span>
  )
}

// One line like "14 outlets · 6 new in last 6h" from the ranking signals.
export function momentumText(c: { publisher_count: number; importance_signals?: { articles_last_6h: number } | null }): string {
  const outlets = `${c.publisher_count} outlet${c.publisher_count !== 1 ? "s" : ""}`
  const recent = c.importance_signals?.articles_last_6h ?? 0
  return recent > 0 ? `${outlets} · ${recent} new in last 6h` : outlets
}
