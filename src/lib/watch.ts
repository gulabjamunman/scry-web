// Data + plain-language verdicts for the Watch section (YouTube videos Scry has analysed).
import { supabase } from "@/lib/supabase"

export type Claim = { text: string; claim_type?: string; reason?: string; impact?: string }
export type RiskSpan = { text: string; risk_explanation?: string }

export type WatchVideo = {
  id: string
  video_id: string
  url: string
  headline: string
  channel: string
  published: string
  views: number | null
  framing: number | null
  intensity: number | null
  sensationalism: number | null
  context: number | null
  context_note: string | null
  title_match: number | null
  title_note: string | null
  fact_ratio: number | null
  claims: Claim[]
  vulnerable: number | null
  risk_spans: RiskSpan[]
  explanation: Record<string, string>
  story_id: string | null
  segments: [number, string][]
  isShort: boolean
}

const LIST_COLS = `
  id, video_id, url, headline, publisher_name, publication_datetime, video_stats,
  ai_framing_direction, ai_language_intensity, ai_sensationalism, ai_headline_alignment,
  ai_fact_ratio, story_cluster_id
`
const DETAIL_COLS = `${LIST_COLS},
  ai_context_score, ai_context_note, ai_headline_note, ai_fact_highlights,
  ai_vulnerable_group_risk, ai_vulnerable_spans, bias_explanation, transcript_segments
`

// bias_explanation is stored as "FRAMING\n...\n\nLANGUAGE INTENSITY\n..." sections.
function parseSections(raw: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const block of raw.split(/\n\n(?=[A-Z][A-Z ]+\n)/)) {
    const [head, ...rest] = block.split("\n")
    const body = rest.join(" ").trim()
    if (head && body) out[head.trim().toLowerCase()] = body
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVideo(r: any): WatchVideo {
  return {
    id: r.id,
    video_id: r.video_id,
    url: r.url,
    headline: r.headline || "",
    channel: r.publisher_name || "",
    published: r.publication_datetime,
    views: r.video_stats?.views ?? null,
    framing: r.ai_framing_direction ?? null,
    intensity: r.ai_language_intensity ?? null,
    sensationalism: r.ai_sensationalism ?? null,
    context: r.ai_context_score ?? null,
    context_note: r.ai_context_note || null,
    title_match: r.ai_headline_alignment ?? null,
    title_note: r.ai_headline_note || null,
    fact_ratio: r.ai_fact_ratio ?? null,
    claims: Array.isArray(r.ai_fact_highlights) ? r.ai_fact_highlights : [],
    vulnerable: r.ai_vulnerable_group_risk ?? null,
    risk_spans: Array.isArray(r.ai_vulnerable_spans) ? r.ai_vulnerable_spans : [],
    explanation: parseSections(r.bias_explanation ?? null),
    story_id: r.story_cluster_id ?? null,
    segments: Array.isArray(r.transcript_segments) ? r.transcript_segments : [],
    isShort: typeof r.url === "string" && r.url.includes("/shorts/"),
  }
}

export async function getWatchVideos(limit = 60): Promise<WatchVideo[] | null> {
  const { data, error } = await supabase
    .from("articles")
    .select(LIST_COLS)
    .eq("source_type", "video")
    .eq("processed", true)
    .eq("analysis_skipped", false)
    .order("publication_datetime", { ascending: false })
    .limit(limit)
  if (error) { console.warn("getWatchVideos:", error.message); return null }
  return (data || []).map(toVideo)
}

export async function getWatchVideo(id: string): Promise<WatchVideo | null> {
  let res = await supabase.from("articles").select(DETAIL_COLS).eq("id", id).single()
  if (res.error) {
    // transcript_segments column may not exist yet
    res = await supabase.from("articles").select(DETAIL_COLS.replace(", transcript_segments", "")).eq("id", id).single()
  }
  if (res.error || !res.data) return null
  return toVideo(res.data)
}

export type StoryContext = { id: string; title: string; avg_framing: number | null; outlets: number }

export async function getStoryContext(clusterId: string): Promise<StoryContext | null> {
  const { data } = await supabase
    .from("story_clusters")
    .select("id, title, avg_framing_direction, publisher_count")
    .eq("id", clusterId)
    .single()
  if (!data) return null
  return { id: data.id, title: data.title, avg_framing: data.avg_framing_direction ?? null, outlets: data.publisher_count ?? 0 }
}

/* ── Plain-language verdicts ───────────────────────────────────────────── */

export type Tone = "good" | "warn" | "bad" | "neutral"
export type Verdict = { label: string; tone: Tone }

export function leanVerdict(f: number | null): Verdict {
  if (f == null) return { label: "Lean unknown", tone: "neutral" }
  const strength = Math.abs(f) > 0.6 ? "Strongly " : ""
  if (f < -0.2) return { label: `${strength}leans left`, tone: Math.abs(f) > 0.6 ? "warn" : "neutral" }
  if (f > 0.2) return { label: `${strength}leans right`, tone: Math.abs(f) > 0.6 ? "warn" : "neutral" }
  return { label: "Balanced", tone: "good" }
}

export function toneVerdict(intensity: number | null, sens: number | null): Verdict {
  const v = Math.max(intensity ?? 0, sens ?? 0)
  if (intensity == null && sens == null) return { label: "Tone unknown", tone: "neutral" }
  if (v < 0.3) return { label: "Calm", tone: "good" }
  if (v < 0.6) return { label: "Charged", tone: "warn" }
  return { label: "Heated", tone: "bad" }
}

export function titleVerdict(a: number | null): Verdict {
  if (a == null) return { label: "Title unchecked", tone: "neutral" }
  if (a >= 0.7) return { label: "Title matches", tone: "good" }
  if (a >= 0.4) return { label: "Title stretches it", tone: "warn" }
  return { label: "Title oversells", tone: "bad" }
}

export function factVerdict(r: number | null): Verdict {
  if (r == null) return { label: "Facts unchecked", tone: "neutral" }
  if (r >= 0.6) return { label: "Mostly checkable facts", tone: "good" }
  if (r >= 0.35) return { label: "Fact and opinion mixed", tone: "warn" }
  return { label: "Mostly opinion", tone: "bad" }
}

export function contextVerdict(c: number | null): Verdict {
  if (c == null) return { label: "Context unchecked", tone: "neutral" }
  if (c >= 0.6) return { label: "Gives background", tone: "good" }
  if (c >= 0.35) return { label: "Some background missing", tone: "warn" }
  return { label: "Little background", tone: "bad" }
}

export const TONE_CLASSES: Record<Tone, string> = {
  good:    "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900",
  warn:    "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900",
  bad:     "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900",
  neutral: "text-muted-foreground bg-muted/40 border-border",
}

/* ── Finding the moment a quote is said ────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim()

/** Seconds into the video where `quote` starts, or null if it can't be placed. */
export function findMoment(segments: [number, string][], quote: string): number | null {
  if (!segments.length || !quote) return null
  let full = ""
  const starts: { at: number; t: number }[] = []
  for (const [t, text] of segments) {
    starts.push({ at: full.length, t })
    full += norm(text) + " "
  }
  const q = norm(quote)
  const words = q.split(" ")
  const probes = [q.slice(0, 60), words.slice(0, 6).join(" "), words.slice(0, 4).join(" ")]
  for (const p of probes) {
    if (p.length < 8) continue
    const idx = full.indexOf(p)
    if (idx >= 0) {
      let t = starts[0].t
      for (const s of starts) { if (s.at <= idx) t = s.t; else break }
      return t
    }
  }
  return null
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function fmtViews(v: number | null): string {
  if (v == null) return ""
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)} Cr views`
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)} L views`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K views`
  return `${v} views`
}
