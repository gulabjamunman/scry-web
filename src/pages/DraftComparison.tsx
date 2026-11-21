import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowLeft, ArrowRight, Loader, AlertCircle,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  ExternalLink, User, Building2, Search, CheckCircle2,
  FileText, BarChart3, Zap, Shield, Target, BookOpen,
  Upload, X as XIcon,
} from "lucide-react"
import { getRecentClusters, type ClusterListItem } from "@/lib/api"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DraftScores {
  framing_direction:    number
  language_intensity:   number
  fact_ratio:           number
  context_score:        number
  headline_alignment:   number
  sensationalism_score: number
  vulnerable_score:     number
  topic:                string
  framing_reason:       string
  integrity_note:       string
}

interface MatchedCluster extends ClusterListItem {
  narrative_arc?:          any
  avg_language_intensity?: number
  avg_fact_ratio?:         number
}

interface BaseProfile {
  article_count:      number
  avg_framing:        number
  avg_intensity:      number
  avg_fact_ratio:     number
  avg_sensationalism: number
  top_topics:         { topic: string; count: number }[]
}

interface JournalistProfile extends BaseProfile { byline: string }
interface OrgProfile        extends BaseProfile { org_name: string }

interface SeoCheck {
  id:       string
  category: "headline" | "structure" | "trust" | "freshness" | "aeo"
  label:    string
  pass:     boolean
  detail:   string
  tip:      string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CHECKLIST_KEY = "scry-draft-checklist-v1"

const PUBLISHER_CHECKLIST = [
  { label: "All news URLs indexable — no noindex/nofollow on article pages",                            ref: "A1" },
  { label: "Domain verified in Google Search Console",                                                   ref: "A2" },
  { label: "Google News XML sitemap maintained — last 48h articles only, max 1,000 URLs",               ref: "A3" },
  { label: "Sitemap submitted via GSC and updated on every publish",                                     ref: "A3" },
  { label: "NewsArticle JSON-LD schema on every article (headline, datePublished, author, publisher, image)", ref: "A4" },
  { label: "Schema validated monthly via Google Rich Results Test",                                      ref: "A4" },
  { label: "Every article has a visible byline, author bio page, and publication date",                  ref: "B3" },
  { label: "First image is indexable — not blocked by robots.txt or JS lazy-load",                      ref: "C1" },
  { label: "All images have descriptive alt text",                                                       ref: "C1" },
  { label: "URL pattern is consistent: /category/story-slug-ddmmmyyyy",                                 ref: "C2" },
  { label: "Breaking news submitted via GSC URL Inspection → Request Indexing immediately",              ref: "C3" },
  { label: "Core Web Vitals passing in GSC — required for AI Mode indexing",                            ref: "D1" },
  { label: "No heavy JS-only rendering — AI systems favour clean semantic HTML",                         ref: "D1" },
  { label: "FAQ or HowTo schema added to explainer and Q&A articles",                                   ref: "D3" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function fLabel(v: number): string {
  if (v >  0.5) return "Strong right"
  if (v >  0.2) return "Slight right"
  if (v < -0.5) return "Strong left"
  if (v < -0.2) return "Slight left"
  return "Neutral"
}

function fCls(v: number): string {
  if (v >  0.2) return "text-red-600 dark:text-red-400"
  if (v < -0.2) return "text-blue-600 dark:text-blue-400"
  return "text-muted-foreground"
}

function iLabel(v: number): string {
  if (v > 0.7) return "High"
  if (v > 0.4) return "Moderate"
  return "Low"
}

function iCls(v: number): string {
  if (v > 0.7) return "text-red-600 dark:text-red-400"
  if (v > 0.4) return "text-amber-600 dark:text-amber-400"
  return "text-green-600 dark:text-green-400"
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI atoms
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, cls = "" }: {
  label: string; value: string; sub: string; cls?: string
}) {
  return (
    <div className="rounded-xl border bg-background p-4 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold leading-none ${cls}`}>{value}</p>
      <p className="text-[10px] font-mono text-muted-foreground">{sub}</p>
    </div>
  )
}

function LinearBar({ value, color = "bg-primary", max = 1 }: {
  value: number; color?: string; max?: number
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(Math.abs(value) / max, 1) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono tabular-nums text-muted-foreground w-10 text-right">
        {value > 0 ? "+" : ""}{value.toFixed(2)}
      </span>
    </div>
  )
}

function DeltaRow({ label, draft, base }: { label: string; draft: number; base: number }) {
  const d = draft - base
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <LinearBar value={draft} color="bg-primary/60" />
        <LinearBar value={base}  color="bg-muted-foreground/30" />
      </div>
      <div className="ml-4 shrink-0">
        {Math.abs(d) < 0.05
          ? <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium"><Minus className="h-3 w-3" /> Aligned</span>
          : d > 0
          ? <span className="flex items-center gap-1 text-xs text-red-500 font-medium"><TrendingUp className="h-3 w-3" /> +{d.toFixed(2)}</span>
          : <span className="flex items-center gap-1 text-xs text-blue-500 font-medium"><TrendingDown className="h-3 w-3" /> {d.toFixed(2)}</span>
        }
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle, badge }: {
  icon: any; title: string; subtitle?: string; badge?: string
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b mb-4">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{title}</p>
          {badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 font-medium">
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Arc accordion
// ─────────────────────────────────────────────────────────────────────────────

const ARC_LABELS: Record<string, string> = {
  origin: "Origin", propagation: "How it spread",
  fault_lines: "Fault lines", silences: "Silences", current_state: "Current state",
}

function ArcAccordion({ arc }: { arc: any }) {
  const [open, setOpen] = useState(false)
  if (!arc) return null
  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-xs font-medium text-muted-foreground"
      >
        Narrative arc
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="divide-y">
          {Object.entries(ARC_LABELS).map(([key, label]) => {
            const s = arc[key]
            if (!s?.text) return null
            return (
              <div key={key} className="px-4 py-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.text}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile comparison panel
// ─────────────────────────────────────────────────────────────────────────────

// ── MetricRow: shows one metric with Why? expand ────────────────────────────
function MetricRow({ label, draftVal, baseVal, fmt, why, suggestion }: {
  label: string
  draftVal: number
  baseVal: number
  fmt: (v: number) => string
  why: string
  suggestion: string | null
}) {
  const [open, setOpen] = useState(false)
  const diff = draftVal - baseVal
  const aligned = Math.abs(diff) < 0.08

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <p className="text-xs font-medium w-20 shrink-0">{label}</p>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs font-bold">{fmt(draftVal)}</span>
            <span className="text-[10px] text-muted-foreground">vs {fmt(baseVal)} avg</span>
            {aligned
              ? <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">✓ Aligned</span>
              : diff > 0
              ? <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">↑ +{diff.toFixed(2)}</span>
              : <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">↓ {diff.toFixed(2)}</span>
            }
          </div>
        </div>
        <span className="text-[10px] text-primary font-medium shrink-0 ml-2">Why?</span>
      </button>
      {open && (
        <div className="px-3 py-3 bg-muted/10 border-t space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">{why}</p>
          {suggestion && (
            <div className="flex gap-2 pt-1.5 border-t border-dashed">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider shrink-0 mt-0.5 w-14">Suggestion</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{suggestion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function buildFramingWhy(draft: number, base: number, outlet: string): { why: string; suggestion: string | null } {
  const diff  = draft - base
  const label = fLabel(draft)
  const bLabel = fLabel(base)
  if (Math.abs(diff) < 0.08) return {
    why: `Your framing score (${draft.toFixed(2)}) is ${label}, consistent with your historical average of ${bLabel} (${base.toFixed(2)}). The article uses balanced attribution and avoids heavily loaded political language.`,
    suggestion: null,
  }
  if (diff > 0.35) return {
    why: `This draft scores ${draft.toFixed(2)} — more right-leaning than your usual ${base.toFixed(2)}. This typically happens when the article leads with government or authority perspectives, uses security/nationalist framing, or underrepresents dissenting voices.`,
    suggestion: `Review whether opposition voices or independent analysts are quoted. ${outlet ? `${outlet}'s` : "Your outlet's"} historical average is ${bLabel} — aligning with that reduces framing divergence.`,
  }
  if (diff < -0.35) return {
    why: `This draft scores ${draft.toFixed(2)} — more left-leaning than your usual ${base.toFixed(2)}. This often occurs when coverage emphasises social justice angles, victim perspectives, or institutional critique without balancing official response.`,
    suggestion: `Consider adding official response or institutional context. ${outlet ? `${outlet}'s` : "Your outlet's"} historical average is ${bLabel}.`,
  }
  return {
    why: `Framing is ${label} (${draft.toFixed(2)}), slightly different from your historical average of ${bLabel} (${base.toFixed(2)}). The difference is within a normal range of variation.`,
    suggestion: null,
  }
}

function buildIntensityWhy(draft: number, base: number): { why: string; suggestion: string | null } {
  const diff = draft - base
  if (Math.abs(diff) < 0.08) return {
    why: `Language intensity (${draft.toFixed(2)}) is ${iLabel(draft)}, matching your typical output (${base.toFixed(2)}). Sentence structure and word choice are calibrated to your usual register.`,
    suggestion: null,
  }
  if (diff > 0.2) return {
    why: `Intensity is ${iLabel(draft)} (${draft.toFixed(2)}) — higher than your average of ${base.toFixed(2)}. Elevated intensity typically comes from emotionally charged verbs, exclamation, escalating adjectives, or urgency language like "crisis", "shocking", "alarming".`,
    suggestion: "Scan for adjectives and adverbs that add heat rather than information. Replace with specific facts where possible.",
  }
  if (diff < -0.2) return {
    why: `Intensity is ${iLabel(draft)} (${draft.toFixed(2)}) — lower than your average of ${base.toFixed(2)}. Very restrained language can read as under-engaging on a story that your readers may find significant.`,
    suggestion: "Consider whether the lead paragraph adequately signals the importance of the story.",
  }
  return {
    why: `Intensity (${draft.toFixed(2)}) is ${iLabel(draft)}, close to your historical average (${base.toFixed(2)}).`,
    suggestion: null,
  }
}

function buildFactWhy(draft: number, base: number): { why: string; suggestion: string | null } {
  const diff = draft - base
  if (Math.abs(diff) < 0.08) return {
    why: `Fact ratio (${Math.round(draft * 100)}%) is consistent with your typical output (${Math.round(base * 100)}%). The proportion of verifiable claims, official claims, and interpretive content is within your usual range.`,
    suggestion: null,
  }
  if (diff < -0.15) return {
    why: `Fact ratio (${Math.round(draft * 100)}%) is lower than your historical average (${Math.round(base * 100)}%). This suggests higher-than-usual reliance on unattributed claims, speculative language, or official statements without independent verification.`,
    suggestion: "Add at least one independently verifiable data point (date, figure, court document, named source) per major claim.",
  }
  if (diff > 0.15) return {
    why: `Fact ratio (${Math.round(draft * 100)}%) is higher than your average (${Math.round(base * 100)}%). Strong factual density — this draft is well-evidenced.`,
    suggestion: null,
  }
  return {
    why: `Fact ratio (${Math.round(draft * 100)}%) is close to your historical average (${Math.round(base * 100)}%).`,
    suggestion: null,
  }
}

function ProfilePanel({
  icon: Icon, title, subtitle, profile, draft, outletName,
}: {
  icon: any; title: string; subtitle: string
  profile: BaseProfile; draft: DraftScores; outletName?: string
}) {
  const framingData   = buildFramingWhy(draft.framing_direction,  profile.avg_framing,    outletName ?? "")
  const intensityData = buildIntensityWhy(draft.language_intensity, profile.avg_intensity)
  const factData      = buildFactWhy(draft.fact_ratio,            profile.avg_fact_ratio)

  // Top-level summary
  const diffs = [
    Math.abs(draft.framing_direction  - profile.avg_framing),
    Math.abs(draft.language_intensity - profile.avg_intensity),
    Math.abs(draft.fact_ratio         - profile.avg_fact_ratio),
  ]
  const avgDiff = diffs.reduce((s, v) => s + v, 0) / diffs.length
  const overallSummary = avgDiff < 0.08
    ? "This draft is closely aligned with your historical writing signature."
    : avgDiff < 0.2
    ? "Minor divergence from your historical patterns — within normal range."
    : "Noticeable divergence from your historical patterns. See individual metrics below."

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground truncate">{subtitle} · {profile.article_count} articles in SCRY</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary line */}
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
          {overallSummary}
        </p>

        {/* Metric rows with Why? */}
        <div className="space-y-1.5">
          <MetricRow
            label="Framing"
            draftVal={draft.framing_direction}
            baseVal={profile.avg_framing}
            fmt={fLabel}
            why={framingData.why}
            suggestion={framingData.suggestion}
          />
          <MetricRow
            label="Intensity"
            draftVal={draft.language_intensity}
            baseVal={profile.avg_intensity}
            fmt={iLabel}
            why={intensityData.why}
            suggestion={intensityData.suggestion}
          />
          <MetricRow
            label="Fact ratio"
            draftVal={draft.fact_ratio}
            baseVal={profile.avg_fact_ratio}
            fmt={(v) => `${Math.round(v * 100)}%`}
            why={factData.why}
            suggestion={factData.suggestion}
          />
        </div>

        {/* Topic focus — simplified */}
        {profile.top_topics.length > 0 && (
          <div className="pt-3 border-t space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Most covered topics
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.top_topics.slice(0, 4).map(t => (
                <span key={t.topic} className="text-[10px] px-2 py-1 rounded-full border bg-muted/40 text-muted-foreground font-medium">
                  {t.topic}
                  <span className="ml-1 opacity-50">{t.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO checks engine
// ─────────────────────────────────────────────────────────────────────────────

function computeSeoChecks(headline: string, content: string): SeoCheck[] {
  const words         = content.trim().split(/\s+/).filter(Boolean)
  const wordCount     = words.length
  const sentences     = content.split(/[.!?]+/).filter(s => s.trim().length > 10)
  const avgSentLen    = sentences.length ? wordCount / sentences.length : 0
  const hlChars       = headline.trim().length
  const hlLower       = headline.toLowerCase()

  const namedEntities    = (content.match(/(?<![.!?]\s)[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g) ?? [])
  const hasNamedEntities = namedEntities.length >= 3
  const hasAttribution   = /[""\u201c\u201d]|said|according to|told|stated|confirmed|announced/i.test(content)
  const hasNumbers       = /\d+/.test(content)
  const lines            = content.split("\n").map(l => l.trim()).filter(Boolean)
  const hasSubheadings   = lines.filter(l => l.split(/\s+/).length <= 8 && !/[.!?,;]$/.test(l)).length >= 2
  const hasQuestionHds   = lines.some(l => l.endsWith("?") && l.split(/\s+/).length <= 10)
  const firstPara        = content.slice(0, 600).toLowerCase()
  const wqCount          = ["who","what","when","where","why","how"].filter(w => firstPara.includes(w)).length
  const hasLead          = wqCount >= 2
  const first100         = words.slice(0, 100).join(" ").toLowerCase()
  const hasDirectAnswer  = ["who","what","when","where"].filter(w => first100.includes(w)).length >= 2
  const hlClickbait      = /you won't believe|shocking|mind-blowing|secret|trick|hack/i.test(headline)
  const hlHasEntity      = hasNamedEntities && namedEntities.some(e => hlLower.includes(e.toLowerCase()))
  const hlHasKeyword     = words.some(w => w.length > 4 && hlLower.includes(w.toLowerCase()))
  const goodLength       = wordCount >= 300 && wordCount <= 1800
  const tooShort         = wordCount < 300
  const passiveCount     = (content.match(/\bwas\s+\w+ed\b/gi) ?? []).length
  const hasFreshness     = /updated|breaking|latest|just in|developing|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(content)
  const hasRepetition    = (content.match(/(.{40,})\1/g) ?? []).length > 0
  const sourceCount      = (content.match(/said|according to|told|confirmed|announced|stated/gi) ?? []).length
  const paragraphs       = content.split(/\n{2,}/).filter(p => p.trim().length > 20)
  const hasShortParas    = paragraphs.length === 0 || paragraphs.filter(p => p.split(/\s+/).length > 80).length / paragraphs.length < 0.4

  return [
    // Headline
    { id: "hl-chars",    category: "headline",   label: "Headline ≤ 60 characters",           pass: hlChars <= 60,        detail: hlChars > 60 ? `${hlChars} chars — Google truncates at ~60` : `${hlChars} chars — within display limit`,                  tip: "Front-load the key topic. Cut adjectives and conjunctions first." },
    { id: "hl-factual",  category: "headline",   label: "Factual, no clickbait",               pass: !hlClickbait,          detail: hlClickbait ? "Headline uses patterns Google quality raters flag" : "No clickbait patterns detected",                         tip: "Describe the story plainly. Google News deprioritises misleading headlines." },
    { id: "hl-entity",   category: "headline",   label: "Named entity in headline",            pass: hlHasEntity,            detail: hlHasEntity ? "Named entity present — strong knowledge graph signal" : "No named entity in headline",                           tip: "Include the most newsworthy person, place, or organisation." },
    { id: "hl-keyword",  category: "headline",   label: "Headline terms appear in body",       pass: hlHasKeyword,           detail: hlHasKeyword ? "Headline aligns with body content" : "Headline terms absent from body — misleading headline risk",           tip: "The headline's main noun phrase must appear in the first paragraph." },
    // Structure
    { id: "lead-5w",     category: "structure",  label: "Inverted pyramid lead (5W/H)",        pass: hasLead,                detail: hasLead ? `Lead covers ${wqCount} of 6 W/H questions` : "Opening doesn't establish who/what/when/where",                    tip: "First 50–100 words must answer who, what, when, where, and why." },
    { id: "length",      category: "structure",  label: "Article length 300–1,800 words",      pass: goodLength,             detail: tooShort ? `${wordCount} words — below 300 word minimum` : wordCount > 1800 ? `${wordCount} words — use subheadings` : `${wordCount} words`, tip: "News indexes best at 300–1,800 words." },
    { id: "sentences",   category: "structure",  label: "Readable sentence length (≤ 25w)",    pass: avgSentLen <= 25,       detail: avgSentLen > 25 ? `Average ~${Math.round(avgSentLen)} words/sentence` : `Average ~${Math.round(avgSentLen)} words/sentence`,  tip: "Break long sentences at conjunctions. Short = readable = trusted." },
    { id: "paragraphs",  category: "structure",  label: "Short paragraphs",                    pass: hasShortParas,          detail: hasShortParas ? "Paragraphs appropriately short" : "Some paragraphs are very long",                                          tip: "Keep to 2–4 sentences per paragraph. Helps mobile readers and AI extraction." },
    { id: "passive",     category: "structure",  label: "Predominantly active voice",           pass: passiveCount <= 5,      detail: passiveCount > 5 ? `${passiveCount} passive constructions detected` : "Low passive voice — good authority signal",            tip: "'The court ruled' not 'The ruling was made'. Active = authoritative." },
    { id: "norepeat",    category: "structure",  label: "No repeated content blocks",          pass: !hasRepetition,         detail: hasRepetition ? "Repeated text detected — Google penalises duplication" : "No significant repetition found",                  tip: "Never copy-paste blocks within an article. Each paragraph must add new information." },
    // Trust
    { id: "attribution", category: "trust",      label: "Named source attribution",            pass: hasAttribution,         detail: hasAttribution ? "Claims attributed to named sources — strong E-E-A-T" : "No attribution detected",                           tip: "Every significant claim needs a named source. E-E-A-T requirement." },
    { id: "sources2",    category: "trust",      label: "Multiple sources cited (≥ 2)",        pass: sourceCount >= 2,       detail: `${sourceCount} attribution signal${sourceCount !== 1 ? "s" : ""} found`,                                                    tip: "At least 2 independent named sources. Official + independent expert = strong." },
    { id: "entities",    category: "trust",      label: "Named entities in body",              pass: hasNamedEntities,       detail: hasNamedEntities ? `${namedEntities.length} named entities — good knowledge graph density` : "Few named entities detected",  tip: "Full names on first mention help Google categorise the story." },
    { id: "numbers",     category: "trust",      label: "Specific data and figures",           pass: hasNumbers,             detail: hasNumbers ? "Contains specific numbers — credibility signal" : "No figures detected",                                        tip: "Dates, amounts, counts, percentages signal verified reporting." },
    // Freshness
    { id: "freshness",   category: "freshness",  label: "Date/freshness signal in text",       pass: hasFreshness,           detail: hasFreshness ? "Freshness signals present" : "No date or time reference in body",                                           tip: "Include a date reference or 'as of [date]'. Required for news ranking." },
    { id: "breaking",    category: "freshness",  label: "Breaking label used appropriately",   pass: !/breaking/i.test(content) || hasFreshness, detail: /breaking/i.test(content) && !hasFreshness ? "'Breaking' used without a timestamp" : "Breaking label usage looks appropriate", tip: "Always pair 'breaking' with a specific timestamp in the article body." },
    // AEO
    { id: "aeo-answer",  category: "aeo",        label: "Direct answer in first 100 words",   pass: hasDirectAnswer,        detail: hasDirectAnswer ? "Opening answers core questions — strong AEO signal" : "No direct answer in opening — AI surfaces may skip this", tip: "First 2 sentences = standalone answer. AI engines extract this verbatim." },
    { id: "aeo-qhds",    category: "aeo",        label: "Question-style subheadings",         pass: hasQuestionHds || wordCount < 400, detail: hasQuestionHds ? "Question subheadings found — AI search anchor points" : wordCount < 400 ? "Short article — not required" : "No question subheadings found", tip: "Use H2s as questions: 'What caused...?' 'How will this affect...?'" },
    { id: "aeo-scan",    category: "aeo",        label: "Scannable structure for AI extraction", pass: hasSubheadings || wordCount < 400, detail: hasSubheadings ? "Scannable sections detected" : wordCount < 400 ? "Short article" : "No section breaks in long article", tip: "Subheadings every 200–300 words act as semantic anchors for AI engines." },
    { id: "aeo-human",   category: "aeo",        label: "Human-first writing (D4)",            pass: hasShortParas && avgSentLen <= 25, detail: hasShortParas && avgSentLen <= 25 ? "Clear structure — naturally helps AI extraction" : "Dense prose may hinder AI extraction", tip: "Write for readers. Clear structure helps AI as a byproduct." },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO panel component
// ─────────────────────────────────────────────────────────────────────────────

type SeoCategory = "headline" | "structure" | "trust" | "freshness" | "aeo"

const SEO_CATS: { key: SeoCategory; label: string; ref: string; icon: any }[] = [
  { key: "headline",  label: "Headline",       ref: "B1",    icon: FileText  },
  { key: "structure", label: "Structure",      ref: "B1/C4", icon: BarChart3 },
  { key: "trust",     label: "E-E-A-T",        ref: "B3",    icon: Shield    },
  { key: "freshness", label: "Freshness",      ref: "B2",    icon: Zap       },
  { key: "aeo",       label: "AI Search",      ref: "D",     icon: Target    },
]

function SeoPanel({
  headline, content, checkedItems, onToggleCheck,
}: {
  headline: string; content: string
  checkedItems: Set<string>; onToggleCheck: (label: string) => void
}) {
  const [expanded,      setExpanded]      = useState<string | null>(null)
  const [showInfra,     setShowInfra]     = useState(false)
  const [activeTab,     setActiveTab]     = useState<SeoCategory>("headline")

  const checks   = computeSeoChecks(headline, content)
  const passing  = checks.filter(c => c.pass).length
  const total    = checks.length
  const score    = Math.round((passing / total) * 100)
  const scoreCls = score >= 80 ? "text-green-600 dark:text-green-400" : score >= 55 ? "text-amber-500" : "text-red-500"
  const scoreBg  = score >= 80 ? "bg-green-500" : score >= 55 ? "bg-amber-500" : "bg-red-500"

  const tabChecks = checks.filter(c => c.category === activeTab)
  const tabPass   = tabChecks.filter(c => c.pass).length

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header with score */}
      <div className="px-5 py-4 border-b bg-muted/20 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-sm font-semibold">SEO / AEO Readiness</p>
          </div>
          <p className="text-xs text-muted-foreground pl-9">
            Google News guidelines · E-E-A-T · AI Overview optimisation
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-3xl font-bold tabular-nums ${scoreCls}`}>{score}%</p>
          <p className="text-[10px] text-muted-foreground">{passing}/{total} checks</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1 w-full bg-muted">
        <div className={`h-full transition-all duration-700 ${scoreBg}`} style={{ width: `${score}%` }} />
      </div>

      {/* Category tabs */}
      <div className="flex border-b overflow-x-auto">
        {SEO_CATS.map(cat => {
          const catChecks = checks.filter(c => c.category === cat.key)
          const catPass   = catChecks.filter(c => c.pass).length
          const allPass   = catPass === catChecks.length
          const active    = activeTab === cat.key
          return (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`flex-1 min-w-0 flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors border-b-2 ${
                active
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{cat.label}</span>
              <span className={`font-mono ${allPass ? "text-green-500" : catPass === 0 ? "text-red-500" : "text-amber-500"}`}>
                {catPass}/{catChecks.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Checks for active tab */}
      <div className="p-4 space-y-1.5">
        <div className="flex items-center justify-between pb-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {SEO_CATS.find(c => c.key === activeTab)?.label} checks
            <span className="ml-2 font-mono normal-case opacity-60">ref: {SEO_CATS.find(c => c.key === activeTab)?.ref}</span>
          </p>
          <span className={`text-xs font-semibold ${tabPass === tabChecks.length ? "text-green-500" : tabPass === 0 ? "text-red-500" : "text-amber-500"}`}>
            {tabPass}/{tabChecks.length}
          </span>
        </div>

        {tabChecks.map(check => (
          <div key={check.id} className="rounded-lg overflow-hidden border">
            <button
              onClick={() => setExpanded(expanded === check.id ? null : check.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                expanded === check.id ? "bg-muted/40" : "hover:bg-muted/20"
              }`}
            >
              <span className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                check.pass
                  ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400"
                  : "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
              }`}>
                {check.pass ? "✓" : "✗"}
              </span>
              <span className="flex-1 text-xs font-medium">{check.label}</span>
              {expanded === check.id
                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
            </button>
            {expanded === check.id && (
              <div className="px-4 py-3 bg-background border-t space-y-2.5">
                <p className="text-xs text-muted-foreground leading-relaxed">{check.detail}</p>
                {!check.pass && (
                  <div className="flex gap-2 pt-2 border-t border-dashed">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider shrink-0 mt-0.5 w-6">Fix</span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{check.tip}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Publisher infrastructure checklist */}
      <div className="border-t mx-4 mb-4">
        <button
          onClick={() => setShowInfra(p => !p)}
          className="w-full flex items-center justify-between py-4 text-left"
        >
          <div>
            <p className="text-xs font-semibold">Publisher Infrastructure</p>
            <p className="text-[10px] text-muted-foreground">Section A — robots.txt · sitemaps · GSC · JSON-LD · Core Web Vitals</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(checkedItems.size / PUBLISHER_CHECKLIST.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{checkedItems.size}/{PUBLISHER_CHECKLIST.length}</span>
            {showInfra ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>

        {showInfra && (
          <div className="space-y-1.5 pb-2">
            {PUBLISHER_CHECKLIST.map(item => {
              const done = checkedItems.has(item.label)
              return (
                <button
                  key={item.label}
                  onClick={() => onToggleCheck(item.label)}
                  className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                    done ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800" : "bg-muted/20 hover:bg-muted/40 border border-transparent"
                  }`}
                >
                  <span className={`shrink-0 mt-0.5 h-4 w-4 rounded border flex items-center justify-center text-[10px] font-bold transition-all ${
                    done ? "bg-green-500 border-green-500 text-white" : "border-border bg-background"
                  }`}>
                    {done ? "✓" : ""}
                  </span>
                  <span className={`flex-1 text-xs leading-relaxed ${done ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{item.ref}</span>
                </button>
              )
            })}
            <p className="text-[10px] text-muted-foreground pt-1 px-1">Checklist saved to your browser automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loaders
// ─────────────────────────────────────────────────────────────────────────────

// ── Same validation logic as JournalistIntelligence ─────────────────────────
const BYLINE_JUNK_EXACT = new Set([
  "ani","pti","ians","afp","reuters","ap","aps","upi","ubi",
  "staff","bureau","team","admin","editor","editors",
  "correspondent","reporter",
  "web desk","news desk","digital desk","online desk","national desk",
  "city desk","metro desk","sports desk","entertainment desk",
  "business desk","politics desk","foreign desk","international desk",
  "ht news desk","ht trending desk","ht sports desk","ht syndication",
  "ht bureau","india tv news","india tv news desk",
  "ndtv news","ndtv sports","ndtv business",
  "the hindu","the quint","scroll.in","the wire","the print",
  "swarajya staff","opindia staff","opindia desk",
  "newslaundry staff","national herald desk",
  "dw news","bbc news","bbc india",
  "press trust of india","asian news international",
  "news18 hindi","news18 english",
  "agency","agencies","wire service",
  "hindustan times","times of india",
])
const BYLINE_JUNK_CONTAINS = [
  "syndication","news desk","web desk","digital desk","online desk",
  "sports desk","city desk","bureau","news team","editorial team",
  "staff writer","staff reporter","our correspondent","special correspondent",
  "special reporter","our bureau","news agency","photo desk","video desk",
  "with inputs","with reporting","from the wire",
]
const BYLINE_JUNK_STARTS = [
  "edited by","written by","compiled by","reported by",
  "with inputs","with reporting","agency report",
]

function isPersonName(byline: string): boolean {
  if (!byline) return false
  const raw     = byline.trim()
  const lower   = raw.toLowerCase()
  const cleaned = raw.replace(/^(by|by:|author:|written by)\s*/i, "").trim()
  if (cleaned.length < 4 || cleaned.length > 60) return false
  if (/\d/.test(cleaned)) return false
  if (/@|http|www\./.test(cleaned)) return false
  if (cleaned === cleaned.toUpperCase() && cleaned.length > 3) return false
  if (BYLINE_JUNK_EXACT.has(lower)) return false
  if (BYLINE_JUNK_CONTAINS.some(j => lower.includes(j))) return false
  if (BYLINE_JUNK_STARTS.some(j => lower.startsWith(j))) return false
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) {
    if (cleaned === cleaned.toLowerCase()) return false
    if (cleaned === cleaned.toUpperCase()) return false
    if (!/^[A-Z][a-z]{3,}$/.test(cleaned)) return false
  }
  if (parts.length > 5) return false
  const titleCase = parts.filter(p => /^[A-Z][a-z]/.test(p))
  if (titleCase.length < Math.ceil(parts.length * 0.5)) return false
  return true
}

async function loadJournalistProfile(byline: string): Promise<JournalistProfile | null> {
  const b = byline.trim()
  if (!b) return null

  // Read from precomputed byline_profiles — accurate counts, instant response
  const { data, error } = await supabase
    .from("byline_profiles")
    .select("byline, publisher_name, total_articles, avg_framing, avg_intensity, avg_fact_ratio, avg_sensationalism, topic_distribution")
    .eq("byline", b)
    .limit(5)

  if (error || !data || data.length === 0) return null

  // If journalist wrote for multiple outlets, aggregate across all of them
  const totalArticles = data.reduce((s: number, r: any) => s + (r.total_articles || 0), 0)
  const wavg = (field: string) => {
    const weighted = data.reduce((s: number, r: any) => s + (r[field] ?? 0) * (r.total_articles || 0), 0)
    return totalArticles > 0 ? weighted / totalArticles : 0
  }

  // Merge topic distributions — safely parse JSONB which may come as string
  const topicCounts: Record<string, number> = {}
  data.forEach((r: any) => {
    let topics = r.topic_distribution || []
    if (typeof topics === "string") {
      try { topics = JSON.parse(topics) } catch { topics = [] }
    }
    ;(topics as { topic: string; count: number }[]).forEach(t => {
      if (t?.topic) topicCounts[t.topic] = (topicCounts[t.topic] || 0) + (t.count || 1)
    })
  })

  const primaryPublisher = [...data].sort((a: any, b: any) => b.total_articles - a.total_articles)[0]?.publisher_name ?? ""

  return {
    byline:             b + (primaryPublisher ? ` · ${primaryPublisher}` : ""),
    article_count:      totalArticles,
    avg_framing:        wavg("avg_framing"),
    avg_intensity:      wavg("avg_intensity"),
    avg_fact_ratio:     wavg("avg_fact_ratio"),
    avg_sensationalism: wavg("avg_sensationalism"),
    top_topics:         Object.entries(topicCounts)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 4)
                          .map(([topic, count]) => ({ topic, count })),
  }
}

async function loadAllJournalists(): Promise<{ byline: string; publisher: string; count: number }[]> {
  // Read from precomputed byline_profiles table — fast, accurate, no aggregation
  const { data, error } = await supabase
    .from("byline_profiles")
    .select("byline, publisher_name, total_articles")
    .order("byline", { ascending: true })

  if (error || !data) return []

  return data.map((r: any) => ({
    byline:    r.byline,
    publisher: r.publisher_name,
    count:     r.total_articles,
  }))
}

async function loadOrgProfile(publisherName: string): Promise<OrgProfile | null> {
  const { data, error } = await supabase
    .from("articles")
    .select("ai_framing_direction, ai_language_intensity, ai_fact_ratio, ai_sensationalism, topic")
    .eq("publisher_name", publisherName.trim())
    .eq("processed", true)
    .not("ai_framing_direction", "is", null)
    .limit(500)

  if (error || !data || data.length < 5) return null
  const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
  const topicCounts: Record<string, number> = {}
  data.forEach(r => { if (r.topic) topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1 })

  return {
    org_name:           publisherName.trim(),
    article_count:      data.length,
    avg_framing:        avg(data.map(r => r.ai_framing_direction).filter(Boolean) as number[]),
    avg_intensity:      avg(data.map(r => r.ai_language_intensity).filter(Boolean) as number[]),
    avg_fact_ratio:     avg(data.map(r => r.ai_fact_ratio).filter(Boolean) as number[]),
    avg_sensationalism: avg(data.map(r => r.ai_sensationalism).filter(Boolean) as number[]),
    top_topics:         Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([topic, count]) => ({ topic, count })),
  }
}

async function loadPublishers(): Promise<string[]> {
  const { data } = await supabase.from("articles").select("publisher_name").eq("processed", true).order("publisher_name")
  return Array.from(new Set((data || []).map((r: any) => r.publisher_name).filter(Boolean))) as string[]
}

// Auto-detect org publisher name from org_members
async function detectUserOrg(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("org_members")
      .select("organisations(name)")
      .eq("user_id", userId)
      .limit(1)
      .single()
    return (data as any)?.organisations?.name ?? null
  } catch {
    return null
  }
}

// Analyze a list of article URLs and build a profile
// Uses the edge function on each URL (headline = URL, content = url as context)
/**
 * Extract text from a PDF file using the browser's built-in PDF.js
 * (loaded via CDN). Returns the raw text content of all pages.
 * No external API calls — entirely client-side.
 */
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  // Load PDF.js from CDN if not already loaded
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
      script.onload = () => resolve()
      script.onerror = () => reject(new Error("Failed to load PDF.js"))
      document.head.appendChild(script)
    })
    ;(window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
  }
  const pdf    = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const texts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map((item: any) => item.str).join(" "))
  }
  return texts.join("\n").trim()
}

/**
 * Build a journalist profile from uploaded PDF articles.
 * Each PDF is text-extracted client-side, then sent through
 * the real edge function — same pipeline as the draft analyzer.
 * No hallucination, no URL guessing — only real article content.
 */
async function buildProfileFromPdfs(
  files: File[],
  onProgress: (done: number, total: number) => void
): Promise<Omit<JournalistProfile, "byline"> | null> {
  const results: { framing: number; intensity: number; fact_ratio: number; sensationalism: number; topic: string }[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const text = await extractPdfText(file)
      if (text.length < 100) {
        onProgress(i + 1, files.length)
        continue
      }
      // Use filename as headline proxy (strip .pdf extension)
      const headline = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ")
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-draft`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ headline, content: text.slice(0, 6000) }),
      })
      if (res.ok) {
        const data = await res.json()
        if (!data.error && data.framing_direction != null) {
          results.push({
            framing:        data.framing_direction,
            intensity:      data.language_intensity,
            fact_ratio:     data.fact_ratio,
            sensationalism: data.sensationalism_score,
            topic:          data.topic ?? "",
          })
        }
      }
    } catch { /* skip unreadable PDFs */ }
    onProgress(i + 1, files.length)
  }

  if (results.length === 0) return null
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length
  const topicCounts: Record<string, number> = {}
  results.forEach(r => { if (r.topic) topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1 })

  return {
    article_count:      results.length,
    avg_framing:        avg(results.map(r => r.framing)),
    avg_intensity:      avg(results.map(r => r.intensity)),
    avg_fact_ratio:     avg(results.map(r => r.fact_ratio)),
    avg_sensationalism: avg(results.map(r => r.sensationalism)),
    top_topics:         Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([topic, count]) => ({ topic, count })),
  }
}

async function callEdgeFunction(headline: string, content: string): Promise<DraftScores> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-draft`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body:    JSON.stringify({ headline, content: content.slice(0, 6000) }),
  })
  if (!res.ok) throw new Error(`Analysis service unavailable (${res.status}). Please try again.`)
  return res.json()
}

function findNearestCluster(headline: string, content: string, clusters: ClusterListItem[]): MatchedCluster | null {
  const words = new Set((headline + " " + content.slice(0, 500)).toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 4))
  let best: MatchedCluster | null = null, bestScore = 0
  for (const c of clusters) {
    const cw    = (c.title + " " + (c.summary ?? "")).toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 4)
    const score = cw.filter(w => words.has(w)).length / Math.max(cw.length, 1)
    if (score > bestScore) { bestScore = score; best = c as MatchedCluster }
  }
  return bestScore > 0.15 ? best : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DraftComparison() {
  const navigate       = useNavigate()
  const { user }       = useAuth()
  const journoDropRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (journoDropRef.current && !journoDropRef.current.contains(e.target as Node)) {
        setJournoDropOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const [headline, setHeadline] = useState("")
  const [content,  setContent]  = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [clusters, setClusters] = useState<ClusterListItem[]>([])
  const [scores,   setScores]   = useState<DraftScores | null>(null)
  const [matched,  setMatched]  = useState<MatchedCluster | null>(null)
  const [ran,      setRan]      = useState(false)

  // Journalist profile — byline mode
  const [journoMode,      setJournoMode]      = useState<"byline" | "pdfs">("byline")
  const [bylineInput,     setBylineInput]      = useState("")
  const [journoSearch,    setJournoSearch]     = useState("")
  const [journoDropOpen,  setJournoDropOpen]   = useState(false)
  const [allJournalists,  setAllJournalists]   = useState<{ byline: string; publisher: string; count: number }[]>([])
  const [pdfFiles,        setPdfFiles]         = useState<File[]>([])
  const [pdfProgress,     setPdfProgress]      = useState<{ done: number; total: number } | null>(null)
  const [journoProfile,   setJournoProfile]    = useState<JournalistProfile | null>(null)
  const [journoLoading,   setJournoLoading]    = useState(false)
  const [journoError,     setJournoError]      = useState<string | null>(null)

  // Org profile — auto-detected from org_members
  const [detectedOrg,  setDetectedOrg]   = useState<string | null>(null)
  const [selectedOrg,  setSelectedOrg]   = useState("")
  const [publishers,   setPublishers]    = useState<string[]>([])
  const [orgProfile,   setOrgProfile]    = useState<OrgProfile | null>(null)
  const [orgLoading,   setOrgLoading]    = useState(false)
  const [orgError,     setOrgError]      = useState<string | null>(null)

  // localStorage persistence for publisher checklist
  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(CHECKLIST_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  const toggleCheck = useCallback((label: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }, [])

  useEffect(() => {
    loadPublishers().then(setPublishers).catch(() => {})
    loadAllJournalists().then(setAllJournalists).catch(() => {})
    // Auto-detect org from org_members
    if (user?.id) {
      detectUserOrg(user.id).then(name => {
        if (name) {
          setDetectedOrg(name)
          setSelectedOrg(name)
        }
      }).catch(() => {})
    }
  }, [user])

  async function handleLoadJourno() {
    setJournoLoading(true); setJournoError(null)

    try {
      if (journoMode === "byline") {
        if (!bylineInput.trim()) { setJournoLoading(false); return }
        const p = await loadJournalistProfile(bylineInput)
        if (!p) setJournoError(`No articles found for "${bylineInput}" in SCRY's database. The byline must match exactly as it appears in published articles.`)
        else setJournoProfile(p)
      } else {
        // PDF mode — real content, no hallucination
        if (pdfFiles.length === 0) { setJournoError("Upload at least one PDF article."); setJournoLoading(false); return }
        if (pdfFiles.length > 10)  { setJournoError("Maximum 10 PDFs at a time."); setJournoLoading(false); return }

        setPdfProgress({ done: 0, total: pdfFiles.length })
        const p = await buildProfileFromPdfs(pdfFiles, (done, total) => setPdfProgress({ done, total }))
        if (!p) setJournoError("Could not extract text from the uploaded PDFs. Ensure they contain selectable text (not scanned images).")
        else setJournoProfile({ byline: `From ${pdfFiles.length} uploaded article${pdfFiles.length !== 1 ? "s" : ""}`, ...p })
        setPdfProgress(null)
      }
    } catch { setJournoError("Failed to load profile.") }
    finally { setJournoLoading(false) }
  }

  async function handleLoadOrg() {
    if (!selectedOrg) return
    setOrgLoading(true); setOrgError(null)
    try {
      const p = await loadOrgProfile(selectedOrg)
      if (!p) setOrgError("Not enough analyzed articles for this publisher yet.")
      else setOrgProfile(p)
    } catch { setOrgError("Failed to load org profile.") }
    finally { setOrgLoading(false) }
  }

  async function analyze() {
    if (!headline.trim())            return setError("Add a headline.")
    if (content.trim().length < 100) return setError("Add at least 100 characters of content.")
    setError(null); setLoading(true); setRan(false)
    try {
      let clusterList = clusters
      if (!clusterList.length) {
        clusterList = await getRecentClusters(60)
        setClusters(clusterList)
      }
      let draft: DraftScores
      try {
        draft = await callEdgeFunction(headline, content)
      } catch (e: any) {
        throw new Error(e.message ?? "Analysis failed. The scoring service may be temporarily unavailable — please try again.")
      }
      setScores(draft)
      setMatched(findNearestCluster(headline, content, clusterList))
      setRan(true)
    } catch (e: any) {
      setError(e.message ?? "Analysis failed")
    } finally { setLoading(false) }
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:px-6 space-y-6">

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">Draft Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Framing · Ecosystem positioning · Journalist &amp; org profile · SEO/AEO readiness
        </p>
      </div>

      {/* Layout: left sidebar + main content */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

        {/* ── Left sidebar ───────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Draft input */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-sm font-semibold">Your draft</p>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Headline</label>
                  {headline && (
                    <span className={`text-[10px] font-mono tabular-nums ${headline.length > 60 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {headline.length}/60
                    </span>
                  )}
                </div>
                <input
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder="Your article headline…"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground transition"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Content</label>
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{wordCount} words</span>
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Paste your draft here…"
                  rows={10}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground resize-y transition"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}

              <button
                onClick={analyze}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {loading
                  ? <><Loader className="h-4 w-4 animate-spin" /> Analysing…</>
                  : <>Analyse draft <ArrowRight className="h-4 w-4" /></>
                }
              </button>
            </div>
          </div>

          {/* Journalist profile */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">Journalist profile</p>
                <p className="text-[10px] text-muted-foreground">Compare against your historical writing</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden">
                {([
                  { id: "byline", label: "By byline" },
                  { id: "pdfs",   label: "Upload PDFs" },
                ] as const).map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => { setJournoMode(mode.id); setJournoError(null); setJournoProfile(null); setPdfFiles([]) }}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      journoMode === mode.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {journoMode === "byline" ? (
                <div className="space-y-2">
                  {/* Searchable journalist dropdown */}
                  <div className="relative" ref={journoDropRef}>
                    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <input
                        value={journoSearch}
                        onChange={e => { setJournoSearch(e.target.value); setJournoDropOpen(true) }}
                        onFocus={() => setJournoDropOpen(true)}
                        placeholder="Search journalist name…"
                        className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
                      />
                      {bylineInput && (
                        <button
                          onClick={() => { setBylineInput(""); setJournoSearch(""); setJournoProfile(null) }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <span className="text-xs">✕</span>
                        </button>
                      )}
                    </div>

                    {/* Dropdown list */}
                    {journoDropOpen && journoSearch.length >= 1 && (
                      <div className="absolute z-[200] w-full mt-1 rounded-lg border bg-card shadow-xl max-h-64 overflow-y-auto">
                        {allJournalists
                          .filter(j =>
                            j.byline.toLowerCase().includes(journoSearch.toLowerCase()) ||
                            j.publisher.toLowerCase().includes(journoSearch.toLowerCase())
                          )
                          .slice(0, 20)
                          .map(j => (
                            <button
                              key={j.byline}
                              onClick={() => {
                                setBylineInput(j.byline)
                                setJournoSearch(j.byline)
                                setJournoDropOpen(false)
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium whitespace-normal">{j.byline}</p>
                                <p className="text-[10px] text-muted-foreground">{j.publisher}</p>
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                                {j.count} art.
                              </span>
                            </button>
                          ))
                        }
                        {allJournalists.filter(j =>
                          j.byline.toLowerCase().includes(journoSearch.toLowerCase()) ||
                          j.publisher.toLowerCase().includes(journoSearch.toLowerCase())
                        ).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No journalists found</p>
                        )}
                      </div>
                    )}
                  </div>

                  {bylineInput && (
                    <button
                      onClick={handleLoadJourno}
                      disabled={journoLoading || !bylineInput.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50 text-xs font-medium"
                    >
                      {journoLoading
                        ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Loading profile…</>
                        : <>Load profile for {bylineInput}</>
                      }
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* PDF drop zone */}
                  <label className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 cursor-pointer transition-colors ${
                    pdfFiles.length > 0 ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/20"
                  }`}>
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-xs font-medium">Upload PDF articles</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Up to 10 PDFs · must contain selectable text</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []).slice(0, 10)
                        setPdfFiles(files)
                        setJournoError(null)
                      }}
                    />
                  </label>

                  {/* File list */}
                  {pdfFiles.length > 0 && (
                    <div className="space-y-1">
                      {pdfFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs flex-1 truncate">{f.name}</span>
                          <button
                            onClick={() => setPdfFiles(prev => prev.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-destructive transition shrink-0"
                          >
                            <XIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Progress bar */}
                  {pdfProgress && (
                    <div className="space-y-1">
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${(pdfProgress.done / pdfProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Analysing {pdfProgress.done}/{pdfProgress.total} articles…
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleLoadJourno}
                    disabled={journoLoading || pdfFiles.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50 text-xs font-medium"
                  >
                    {journoLoading
                      ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Analysing PDFs…</>
                      : `Analyse ${pdfFiles.length} PDF${pdfFiles.length !== 1 ? "s" : ""}`
                    }
                  </button>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Text is extracted locally — only the article content is sent for analysis. No URLs, no hallucination.
                  </p>
                </div>
              )}

              {journoError && <p className="text-xs text-destructive leading-relaxed">{journoError}</p>}
              {journoProfile && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400 leading-snug">
                    {journoProfile.byline} — {journoProfile.article_count} article{journoProfile.article_count !== 1 ? "s" : ""} analysed
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Org profile */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center">
                <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Organisation profile</p>
                <p className="text-[10px] text-muted-foreground">
                  {detectedOrg ? `Auto-detected: ${detectedOrg}` : "Compare against publication stance"}
                </p>
              </div>
              {detectedOrg && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 shrink-0">
                  Auto
                </span>
              )}
            </div>
            <div className="p-5 space-y-3">
              {detectedOrg && !orgProfile && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                  <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-snug flex-1">
                    Detected your organisation: <span className="font-semibold">{detectedOrg}</span>
                  </p>
                  <button
                    onClick={handleLoadOrg}
                    disabled={orgLoading}
                    className="text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition shrink-0"
                  >
                    {orgLoading ? <Loader className="h-3 w-3 animate-spin" /> : "Load"}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={selectedOrg}
                  onChange={e => setSelectedOrg(e.target.value)}
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-muted-foreground"
                >
                  <option value="">Select publisher…</option>
                  {publishers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button
                  onClick={handleLoadOrg}
                  disabled={orgLoading || !selectedOrg}
                  className="px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-50"
                >
                  {orgLoading ? <Loader className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                </button>
              </div>
              {orgError && <p className="text-xs text-destructive">{orgError}</p>}
              {orgProfile && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                  <p className="text-xs text-green-700 dark:text-green-400 leading-snug">
                    {orgProfile.org_name} — {orgProfile.article_count} articles analysed
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">

          {/* Empty state */}
          {!ran && (
            <div className="rounded-xl border bg-card shadow-sm p-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <BookOpen className="h-7 w-7 text-muted-foreground/40" strokeWidth={1.5} />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <p className="text-sm font-semibold">Paste your draft and click Analyse</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You'll get framing analysis, ecosystem positioning, journalist and org profile comparison, and full SEO/AEO readiness against Google's News guidelines.
                </p>
              </div>
              <div className="flex items-center gap-4 pt-2">
                {[
                  { icon: Zap,       label: "Framing"   },
                  { icon: Target,    label: "SEO/AEO"   },
                  { icon: User,      label: "Profile"   },
                  { icon: Building2, label: "Org stance" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className="h-4 w-4 text-muted-foreground/60" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ran && scores && (
            <>
              {/* Framing analysis */}
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-muted/20 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Framing Analysis</p>
                      <p className="text-xs text-muted-foreground">AI-powered narrative and integrity scoring</p>
                    </div>
                  </div>

                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {[
                      { label: "Framing",       val: fLabel(scores.framing_direction),               sub: scores.framing_direction.toFixed(2),      cls: fCls(scores.framing_direction)   },
                      { label: "Intensity",      val: iLabel(scores.language_intensity),               sub: scores.language_intensity.toFixed(2),     cls: iCls(scores.language_intensity)  },
                      { label: "Fact ratio",     val: `${Math.round(scores.fact_ratio * 100)}%`,       sub: "factual",     cls: "text-foreground" },
                      { label: "Context",        val: `${Math.round(scores.context_score * 100)}%`,    sub: "context",     cls: scores.context_score < 0.4     ? "text-red-600 dark:text-red-400" : "text-foreground" },
                      { label: "Headline",       val: `${Math.round(scores.headline_alignment * 100)}%`, sub: "alignment", cls: scores.headline_alignment < 0.5 ? "text-amber-500" : "text-foreground" },
                      { label: "Sensation",      val: `${Math.round(scores.sensationalism_score * 100)}%`, sub: "score",  cls: scores.sensationalism_score > 0.6 ? "text-red-600 dark:text-red-400" : "text-foreground" },
                    ].map(s => (
                      <StatCard key={s.label} label={s.label} value={s.val} sub={s.sub} cls={s.cls} />
                    ))}
                  </div>

                  {(scores.framing_reason || scores.integrity_note) && (
                    <div className="rounded-lg bg-muted/30 border p-4 space-y-2.5">
                      {scores.framing_reason && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground">Framing — </span>{scores.framing_reason}
                        </p>
                      )}
                      {scores.integrity_note && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground">Integrity — </span>{scores.integrity_note}
                        </p>
                      )}
                    </div>
                  )}

                  {scores.topic && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full border bg-muted/30 text-muted-foreground font-medium">{scores.topic}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Journalist comparison */}
              {journoProfile && (
                <ProfilePanel
                  icon={User}
                  title="vs. Your writing profile"
                  subtitle={journoProfile.byline}
                  profile={journoProfile}
                  draft={scores}
                  outletName={orgProfile?.org_name}
                />
              )}

              {/* Org comparison */}
              {orgProfile && (
                <ProfilePanel
                  icon={Building2}
                  title={`vs. ${orgProfile.org_name}`}
                  subtitle="Historical editorial stance"
                  profile={orgProfile}
                  draft={scores}
                  outletName={orgProfile.org_name}
                />
              )}

              {/* Ecosystem comparison */}
              {matched ? (
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b bg-muted/20 space-y-1">
                    <p className="text-sm font-semibold">vs. Ecosystem</p>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Your draft is being compared against the active story cluster that best matches your headline and content.
                    </p>
                    <div className="flex items-start gap-2 pt-1">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5 shrink-0">Cluster</span>
                      <p className="text-xs font-medium leading-snug">{matched.title}</p>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {matched.article_count} articles from {matched.publisher_count} publisher{matched.publisher_count !== 1 ? "s" : ""}
                      {(matched.silent_count ?? 0) > 0 && ` · ${matched.silent_count} not covering`}
                    </p>
                  </div>
                  <div className="p-5 space-y-4">

                    {/* Comparison table — clearly labelled */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Your draft vs. cluster average
                      </p>
                      <div className="rounded-lg border overflow-hidden">
                        {/* Column headers */}
                        <div className="grid grid-cols-3 px-3 py-2 bg-muted/30 border-b">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Metric</span>
                          <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Your draft</span>
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Cluster avg</span>
                        </div>
                        {[
                          {
                            label: "Framing",
                            draftVal: scores.framing_direction,
                            baseVal:  matched.avg_framing_direction ?? 0,
                            fmt:      fLabel,
                            draftCls: fCls(scores.framing_direction),
                          },
                          {
                            label: "Intensity",
                            draftVal: scores.language_intensity,
                            baseVal:  matched.avg_language_intensity ?? 0.5,
                            fmt:      iLabel,
                            draftCls: iCls(scores.language_intensity),
                          },
                          {
                            label: "Fact ratio",
                            draftVal: scores.fact_ratio,
                            baseVal:  matched.avg_fact_ratio ?? 0.5,
                            fmt:      (v: number) => `${Math.round(v * 100)}%`,
                            draftCls: "",
                          },
                        ].map(row => {
                          const diff = row.draftVal - row.baseVal
                          return (
                            <div key={row.label} className="grid grid-cols-3 px-3 py-2.5 border-b last:border-0 items-center">
                              <span className="text-xs text-muted-foreground">{row.label}</span>
                              <span className={`text-xs font-bold ${row.draftCls}`}>{row.fmt(row.draftVal)}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{row.fmt(row.baseVal)}</span>
                                {Math.abs(diff) > 0.08 && (
                                  <span className={`text-[10px] font-mono ${diff > 0 ? "text-amber-500" : "text-blue-500"}`}>
                                    {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Publishers covering */}
                    {(matched.publishers ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Publishers covering this story
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {matched.publishers!.map(p => (
                            <span key={p} className="text-xs px-2 py-0.5 rounded border bg-muted/30 text-muted-foreground">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Silent publishers */}
                    {(matched.publishers_silent ?? []).length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          Not yet covering this story
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {matched.publishers_silent!.map(p => (
                            <span key={p} className="text-xs px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground/60">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <ArcAccordion arc={(matched as any).narrative_arc} />

                    <button
                      onClick={() => navigate(`/cluster/${matched.id}`)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      Open full intelligence file <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-card shadow-sm p-5">
                  <p className="text-sm font-semibold mb-1">No matching cluster found</p>
                  <p className="text-xs text-muted-foreground">No active story cluster closely matches this draft. This could mean it's a new angle, an underreported story, or the topic hasn't been picked up by other publishers yet.</p>
                </div>
              )}

              {/* SEO / AEO */}
              <SeoPanel
                headline={headline}
                content={content}
                checkedItems={checkedItems}
                onToggleCheck={toggleCheck}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
