import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow, parseISO } from "date-fns"
import { PlayCircle, Youtube } from "lucide-react"
import {
  getWatchVideos, leanVerdict, toneVerdict, titleVerdict, fmtViews,
  TONE_CLASSES, type WatchVideo, type Verdict,
} from "@/lib/watch"

function Chip({ v }: { v: Verdict }) {
  return <span className={`text-[11px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${TONE_CLASSES[v.tone]}`}>{v.label}</span>
}

function VideoCard({ v }: { v: WatchVideo }) {
  const navigate = useNavigate()
  const age = v.published ? formatDistanceToNow(parseISO(v.published), { addSuffix: true }) : ""
  return (
    <button
      onClick={() => navigate(`/watch/${v.id}`)}
      className="text-left rounded-xl border bg-card overflow-hidden hover:bg-muted/30 transition-colors group"
    >
      <div className="relative aspect-video bg-muted">
        <img
          src={`https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
          <PlayCircle className="h-10 w-10 text-white/90 drop-shadow opacity-80 group-hover:opacity-100" />
        </div>
        {v.isShort && (
          <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/70 text-white">Short</span>
        )}
      </div>
      <div className="p-3 space-y-2">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{v.headline}</p>
        <p className="text-[11px] text-muted-foreground">
          {v.channel}{v.views != null ? ` · ${fmtViews(v.views)}` : ""}{age ? ` · ${age}` : ""}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Chip v={leanVerdict(v.framing)} />
          <Chip v={toneVerdict(v.intensity, v.sensationalism)} />
          <Chip v={titleVerdict(v.title_match)} />
        </div>
      </div>
    </button>
  )
}

export default function WatchPage() {
  const [videos, setVideos]   = useState<WatchVideo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState("All")

  useEffect(() => {
    getWatchVideos().then(setVideos).finally(() => setLoading(false))
  }, [])

  const channels = useMemo(
    () => ["All", ...Array.from(new Set((videos || []).map(v => v.channel))).sort()],
    [videos],
  )
  const shown = (videos || []).filter(v => channel === "All" || v.channel === channel)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 lg:px-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <Youtube className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Watch</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-xl">
          News videos from popular YouTube channels, with Scry's read on each one: which way it leans,
          how heated it is, and whether the title matches what's said. Tap a video to watch it with the details.
        </p>
      </div>

      {channels.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {channels.map(c => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
                channel === c
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading videos…
        </div>
      )}

      {!loading && shown.length === 0 && (
        <p className="text-sm text-muted-foreground py-16 text-center">
          No analysed videos yet. They appear here once they've been scored.
        </p>
      )}

      {!loading && shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(v => <VideoCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  )
}
