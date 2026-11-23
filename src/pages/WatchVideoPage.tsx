import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft, ChevronDown, Compass, Flame, Heading, Scale, BookOpen, ShieldAlert,
  Newspaper, Clock, ExternalLink,
} from "lucide-react"
import {
  getWatchVideo, getStoryContext, leanVerdict, toneVerdict, titleVerdict, factVerdict,
  contextVerdict, findMoment, fmtTime, fmtViews, TONE_CLASSES,
  type WatchVideo, type StoryContext, type Verdict,
} from "@/lib/watch"

/* ── Small pieces ──────────────────────────────────────────────────────── */

function Chip({ v }: { v: Verdict }) {
  return <span className={`text-[11px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${TONE_CLASSES[v.tone]}`}>{v.label}</span>
}

function Meter({ value, left, right }: { value: number; left: string; right: string }) {
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>{left}</span><span>{right}</span></div>
    </div>
  )
}

// Left–right spectrum with this video's position, and the newspapers' average if known.
function Spectrum({ video, papers }: { video: number; papers: number | null }) {
  const pos = (x: number) => `${((x + 1) / 2) * 100}%`
  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-gradient-to-r from-sky-400/60 via-muted to-rose-400/60">
        {papers != null && (
          <div className="absolute -top-1 h-4 w-0.5 bg-muted-foreground" style={{ left: pos(papers) }} title="Newspapers' average" />
        )}
        <div className="absolute -top-1.5 h-5 w-5 -ml-2.5 rounded-full border-2 border-background bg-primary shadow" style={{ left: pos(video) }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>Left</span><span>Centre</span><span>Right</span></div>
      {papers != null && (
        <p className="text-[11px] text-muted-foreground">
          <span className="inline-block h-2.5 w-0.5 bg-muted-foreground align-middle mr-1.5" />
          where the newspapers covering this story sit on average
        </p>
      )}
    </div>
  )
}

function InfoCard({
  icon: Icon, title, verdict, open, onToggle, children,
}: {
  icon: React.ElementType; title: string; verdict: Verdict; open: boolean
  onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card">
      <button onClick={onToggle} className="w-full flex items-center gap-3 p-3.5 text-left">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1">{title}</span>
        <Chip v={verdict} />
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3.5 pb-4 pt-0 space-y-3 text-sm leading-relaxed">{children}</div>}
    </div>
  )
}

type Moment = { t: number | null; kind: string; quote: string; why: string; cls: string }

const CLAIM_STYLE: Record<string, { label: string; cls: string }> = {
  verifiable:  { label: "Checkable fact", cls: "bg-emerald-500" },
  unverified:  { label: "Unsourced claim", cls: "bg-amber-500" },
  speculative: { label: "Speculation",     cls: "bg-violet-500" },
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function WatchVideoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const frame = useRef<HTMLIFrameElement>(null)

  const [video, setVideo]     = useState<WatchVideo | null>(null)
  const [story, setStory]     = useState<StoryContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen]       = useState<string | null>("lean")
  const [active, setActive]   = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getWatchVideo(id).then(v => {
      setVideo(v)
      if (v?.story_id) getStoryContext(v.story_id).then(setStory)
    }).finally(() => setLoading(false))
  }, [id])

  const moments: Moment[] = useMemo(() => {
    if (!video) return []
    const list: Moment[] = [
      ...video.claims.map(c => {
        const st = CLAIM_STYLE[(c.claim_type || "").split(" ")[0]] ?? { label: "Claim", cls: "bg-slate-400" }
        return { t: findMoment(video.segments, c.text), kind: st.label, quote: c.text, why: c.reason || "", cls: st.cls }
      }),
      ...video.risk_spans.map(s => ({
        t: findMoment(video.segments, s.text), kind: "Sensitive", quote: s.text,
        why: s.risk_explanation || "", cls: "bg-rose-500",
      })),
    ]
    return list.sort((a, b) => (a.t ?? 1e9) - (b.t ?? 1e9))
  }, [video])

  const duration = video?.segments.length ? video.segments[video.segments.length - 1][0] + 5 : 0

  function seek(t: number | null, i: number) {
    setActive(i)
    if (t == null || !frame.current?.contentWindow) return
    const send = (func: string, args: unknown[] = []) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*")
    send("seekTo", [Math.max(t - 1, 0), true])
    send("playVideo")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Loading video…
      </div>
    )
  }
  if (!video) {
    return <p className="text-sm text-muted-foreground py-24 text-center">This video isn't available.</p>
  }

  const lean    = leanVerdict(video.framing)
  const tone    = toneVerdict(video.intensity, video.sensationalism)
  const title   = titleVerdict(video.title_match)
  const facts   = factVerdict(video.fact_ratio)
  const context = contextVerdict(video.context)
  const showRisk = (video.vulnerable ?? 0) >= 0.3 || video.risk_spans.length > 0
  const ex = video.explanation
  const toggle = (k: string) => setOpen(o => (o === k ? null : k))

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 lg:px-6">
      <button onClick={() => navigate("/watch")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> All videos
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">

        {/* Player + moments */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          {/* On phones the player stays pinned while the cards scroll under it */}
          <div className={`sticky top-0 z-10 lg:static -mx-4 px-4 py-2 lg:m-0 lg:p-0 bg-background`}>
          <div className={`relative w-full overflow-hidden rounded-xl bg-black ${video.isShort ? "aspect-[9/16] max-h-[60vh] lg:max-h-none max-w-sm mx-auto" : "aspect-video"}`}>
            <iframe
              ref={frame}
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${video.video_id}?enablejsapi=1&rel=0&playsinline=1`}
              title={video.headline}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-bold leading-snug">{video.headline}</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">{video.channel}</span>
              {video.views != null && <span>· {fmtViews(video.views)}</span>}
              <a href={video.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                · on YouTube <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Chip v={lean} /><Chip v={tone} /><Chip v={title} /><Chip v={facts} />
            </div>
          </div>

          {moments.length > 0 && (
            <div className="rounded-xl border bg-card p-3.5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Key moments</span>
                <span className="text-[11px] text-muted-foreground">tap to jump there</span>
              </div>

              {duration > 0 && (
                <div className="relative h-2 rounded-full bg-muted">
                  {moments.map((m, i) => m.t != null && (
                    <button
                      key={i}
                      onClick={() => seek(m.t, i)}
                      className={`absolute -top-1 h-4 w-1.5 -ml-0.5 rounded-sm ${m.cls} ${active === i ? "ring-2 ring-primary" : ""}`}
                      style={{ left: `${Math.min((m.t / duration) * 100, 100)}%` }}
                      aria-label={`${m.kind} at ${fmtTime(m.t)}`}
                    />
                  ))}
                </div>
              )}

              <ul className="space-y-1.5 max-h-80 overflow-auto pr-1">
                {moments.map((m, i) => (
                  <li key={i}>
                    <button
                      onClick={() => seek(m.t, i)}
                      className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${active === i ? "bg-muted" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={`h-2 w-2 rounded-full ${m.cls}`} />
                        <span className="font-medium">{m.kind}</span>
                        {m.t != null && <span className="font-mono text-muted-foreground">{fmtTime(m.t)}</span>}
                      </div>
                      <p className="text-sm mt-1 line-clamp-2">"{m.quote}"</p>
                      {active === i && m.why && <p className="text-xs text-muted-foreground mt-1">{m.why}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Scry's read */}
        <div className="space-y-2.5">
          <p className="text-[11px] font-mono tracking-widest uppercase text-muted-foreground">Scry's read</p>

          {ex["overall interpretation"] && (
            <p className="text-sm leading-relaxed rounded-xl bg-muted/40 p-3.5">{ex["overall interpretation"]}</p>
          )}

          <InfoCard icon={Compass} title="Which way it leans" verdict={lean} open={open === "lean"} onToggle={() => toggle("lean")}>
            {video.framing != null && <Spectrum video={video.framing} papers={story?.avg_framing ?? null} />}
            {ex["framing"] && <p className="text-muted-foreground">{ex["framing"]}</p>}
          </InfoCard>

          <InfoCard icon={Flame} title="How heated it is" verdict={tone} open={open === "tone"} onToggle={() => toggle("tone")}>
            {video.intensity != null && <Meter value={video.intensity} left="Calm" right="Heated" />}
            {ex["language intensity"] && <p className="text-muted-foreground">{ex["language intensity"]}</p>}
            {ex["sensationalism"] && <p className="text-muted-foreground">{ex["sensationalism"]}</p>}
          </InfoCard>

          <InfoCard icon={Heading} title="Does the title match?" verdict={title} open={open === "title"} onToggle={() => toggle("title")}>
            {video.title_match != null && <Meter value={video.title_match} left="Oversells" right="Matches" />}
            {video.title_note && <p className="text-muted-foreground">{video.title_note}</p>}
          </InfoCard>

          <InfoCard icon={Scale} title="Facts vs opinion" verdict={facts} open={open === "facts"} onToggle={() => toggle("facts")}>
            {video.fact_ratio != null && <Meter value={video.fact_ratio} left="Opinion" right="Checkable facts" />}
            <p className="text-muted-foreground">
              {video.claims.length} claims picked out. Find them under Key moments, colour-coded:
              green checkable, amber unsourced, purple speculation.
            </p>
          </InfoCard>

          <InfoCard icon={BookOpen} title="Background given" verdict={context} open={open === "context"} onToggle={() => toggle("context")}>
            {video.context_note && <p className="text-muted-foreground">{video.context_note}</p>}
          </InfoCard>

          {showRisk && (
            <InfoCard
              icon={ShieldAlert}
              title="Who could be hurt"
              verdict={{ label: (video.vulnerable ?? 0) >= 0.5 ? "Risk to a group" : "Some risk", tone: (video.vulnerable ?? 0) >= 0.5 ? "bad" : "warn" }}
              open={open === "risk"}
              onToggle={() => toggle("risk")}
            >
              {video.risk_spans.map((s, i) => (
                <div key={i}>
                  <p>"{s.text}"</p>
                  {s.risk_explanation && <p className="text-muted-foreground text-xs mt-0.5">{s.risk_explanation}</p>}
                </div>
              ))}
            </InfoCard>
          )}

          {story && (
            <button
              onClick={() => navigate(`/cluster/${story.id}`)}
              className="w-full rounded-xl border bg-card p-3.5 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                <Newspaper className="h-3.5 w-3.5" /> In the news · {story.outlets} outlet{story.outlets !== 1 ? "s" : ""}
              </div>
              <p className="text-sm font-semibold leading-snug">{story.title}</p>
              <p className="text-xs text-primary mt-1">See how the newspapers covered it →</p>
            </button>
          )}

          <p className="text-[11px] text-muted-foreground pt-2">
            Based on the video's captions, which can mishear words. Quotes link to the moment they're said when the captions line up.
          </p>
        </div>
      </div>
    </div>
  )
}
