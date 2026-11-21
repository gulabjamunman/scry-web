import { useEffect, useState, useMemo, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { getArticles } from "@/lib/api"
import type { Article } from "@/lib/types"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Point {
  id: string
  x: number
  y: number
  bx: number
  by: number
  headline: string
  publisher: string
  date: string
  color: string
  radius: number
  processed: boolean
  reviewCount: number
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getColor(leaning: number): string {
  if (leaning < -0.3) return "#2563eb"
  if (leaning < -0.1) return "#93c5fd"
  if (leaning >  0.3) return "#dc2626"
  if (leaning >  0.1) return "#fca5a5"
  return "#94a3b8"
}

function getDotRadius(reviewCount: number, processed: boolean): number {
  const base = processed ? 5 : 4
  if (reviewCount >= 5) return base + 3
  if (reviewCount >= 2) return base + 1.5
  if (reviewCount >= 1) return base + 0.5
  return base
}

function linearScale(domain: [number, number], range: [number, number]) {
  return (v: number) =>
    range[0] + ((v - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0])
}

// ─────────────────────────────────────────────
// Beeswarm — pure JS force simulation
// No d3 required
// ─────────────────────────────────────────────

function computeBeeswarm(
  points: Omit<Point, "bx" | "by">[],
  xScale: (v: number) => number,
  yScale: (v: number) => number,
  innerW: number,
  innerH: number,
): Point[] {
  const nodes = points.map(p => ({
    ...p,
    bx: xScale(p.x),
    by: yScale(p.y),
  }))

  for (let tick = 0; tick < 280; tick++) {
    // Pull toward true X position (strong)
    nodes.forEach(n => {
      n.bx += (xScale(n.x) - n.bx) * 0.09
    })
    // Pull toward true Y position (weak — allows vertical spread)
    nodes.forEach(n => {
      n.by += (yScale(n.y) - n.by) * 0.015
    })
    // Collision resolution
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]
        const b = nodes[j]
        const minDist = a.radius + b.radius + 1.5
        const dx = b.bx - a.bx
        const dy = b.by - a.by
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.5
          a.bx -= dx * push * 0.5
          a.by -= dy * push * 0.5
          b.bx += dx * push * 0.5
          b.by += dy * push * 0.5
        }
      }
    }
    // Clamp to bounds
    nodes.forEach(n => {
      n.bx = Math.max(n.radius, Math.min(innerW - n.radius, n.bx))
      n.by = Math.max(n.radius, Math.min(innerH - n.radius, n.by))
    })
  }

  return nodes
}

// ─────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────

function Tooltip({
  point,
  innerW,
  innerH,
}: {
  point: Point
  innerW: number
  innerH: number
}) {
  const tw = 220
  const th = 120
  const margin = 14

  let tx = point.bx + margin
  let ty = point.by - th / 2
  if (tx + tw > innerW) tx = point.bx - tw - margin
  if (ty < 0)           ty = margin
  if (ty + th > innerH) ty = innerH - th - margin

  return (
    <foreignObject x={tx} y={ty} width={tw} height={th} style={{ overflow: "visible", pointerEvents: "none" }}>
      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "10px 13px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 700, color: "#0f172a", lineHeight: 1.4, marginBottom: 5,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {point.headline}
        </div>
        <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>
          {point.publisher} · {new Date(point.date).toLocaleDateString()}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", fontSize: 11 }}>
          <span style={{ color: "#94a3b8" }}>Leaning</span>
          <span style={{ fontWeight: 600, color: point.color }}>{point.x.toFixed(2)}</span>
          <span style={{ color: "#94a3b8" }}>Intensity</span>
          <span style={{ fontWeight: 600 }}>{(point.y * 100).toFixed(1)}%</span>
          <span style={{ color: "#94a3b8" }}>Reviews</span>
          <span style={{ fontWeight: 600 }}>{point.reviewCount}</span>
        </div>
        <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 6, fontWeight: 600 }}>
          Click to open article →
        </div>
      </div>
    </foreignObject>
  )
}

// ─────────────────────────────────────────────
// Chart
// ─────────────────────────────────────────────

const MARGIN = { top: 30, right: 24, bottom: 50, left: 52 }

function BeeswarmChart({
  data,
  onClickPoint,
}: {
  data: Omit<Point, "bx" | "by">[]
  onClickPoint: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(880)
  const height = Math.max(400, width * 0.44)
  const [hovered, setHovered] = useState<Point | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const innerW = width  - MARGIN.left - MARGIN.right
  const innerH = height - MARGIN.top  - MARGIN.bottom

  const xScale = useCallback(
    (v: number) => linearScale([-1, 1], [0, innerW])(v),
    [innerW]
  )
  const yScale = useCallback(
    (v: number) => linearScale([0, 1], [innerH, 0])(v),
    [innerH]
  )

  const points = useMemo(() => {
    if (!data.length || innerW < 10) return []
    return computeBeeswarm(data, xScale, yScale, innerW, innerH)
  }, [data, xScale, yScale, innerW, innerH])

  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  const xTicks = [-1, -0.5, 0, 0.5, 1]

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", fontFamily: "system-ui, sans-serif" }}
      >
        <defs>
          <clipPath id="beeclip">
            <rect width={innerW} height={innerH} />
          </clipPath>
        </defs>

        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>

          {/* Zone bands */}
          <rect x={0} y={0} width={xScale(-0.1)} height={innerH} fill="#eff6ff" opacity={0.45} />
          <rect x={xScale(0.1)} y={0} width={xScale(1) - xScale(0.1)} height={innerH} fill="#fff1f2" opacity={0.45} />

          {/* Grid */}
          {yTicks.map(t => (
            <line key={`gy${t}`} x1={0} x2={innerW} y1={yScale(t)} y2={yScale(t)} stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {xTicks.map(t => (
            <line key={`gx${t}`} x1={xScale(t)} x2={xScale(t)} y1={0} y2={innerH} stroke="#f1f5f9" strokeWidth={1} />
          ))}

          {/* Reference lines */}
          <line x1={xScale(0)}    x2={xScale(0)}    y1={0} y2={innerH} stroke="#cbd5e1" strokeWidth={1.5} />
          <line x1={xScale(-0.1)} x2={xScale(-0.1)} y1={0} y2={innerH} stroke="#bfdbfe" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={xScale(0.1)}  x2={xScale(0.1)}  y1={0} y2={innerH} stroke="#fecaca" strokeWidth={1} strokeDasharray="4 3" />

          {/* Zone labels */}
          {([[-0.55, "#93c5fd", "LEFT"], [0, "#94a3b8", "CENTER"], [0.55, "#fca5a5", "RIGHT"]] as const).map(([x, c, label]) => (
            <text key={label} x={xScale(x)} y={15} textAnchor="middle" fontSize={9} fontWeight={700} fill={c} letterSpacing={1}>
              {label}
            </text>
          ))}

          {/* Y axis */}
          {yTicks.map(t => (
            <g key={`yt${t}`} transform={`translate(0,${yScale(t)})`}>
              <line x1={-4} x2={0} stroke="#cbd5e1" />
              <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill="#94a3b8">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          {/* X axis */}
          {xTicks.map(t => (
            <g key={`xt${t}`} transform={`translate(${xScale(t)},${innerH})`}>
              <line y1={0} y2={4} stroke="#cbd5e1" />
              <text y={16} textAnchor="middle" fontSize={10} fill="#94a3b8">
                {t === 0 ? "0" : t > 0 ? `R ${t}` : `L ${Math.abs(t)}`}
              </text>
            </g>
          ))}

          {/* Axis labels */}
          <text x={innerW / 2} y={innerH + 42} textAnchor="middle" fontSize={12} fill="#64748b" fontWeight={500}>
            Political Leaning
          </text>
          <text transform={`translate(-38,${innerH / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="#64748b" fontWeight={500}>
            Emotional Intensity
          </text>

          {/* Dots */}
          <g clipPath="url(#beeclip)">
            {points.map(p => (
              <circle
                key={p.id}
                cx={p.bx}
                cy={p.by}
                r={p.radius}
                fill={p.processed ? p.color : "transparent"}
                stroke={p.color}
                strokeWidth={p.processed ? 0 : 1.5}
                opacity={hovered?.id === p.id ? 1 : 0.75}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onClickPoint(p.id)}
              />
            ))}
          </g>

          {/* Tooltip */}
          {hovered && (
            <Tooltip point={hovered} innerW={innerW} innerH={innerH} />
          )}

        </g>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function IdeologicalMapPage() {
  const navigate                  = useNavigate()
  const [articles, setArticles]   = useState<Article[]>([])
  const [publisher, setPublisher] = useState("all")
  const [showOnly, setShowOnly]   = useState<"all" | "processed" | "reviewed">("all")

  useEffect(() => { getArticles().then(setArticles) }, [])

  const publishers = useMemo(() => {
    const set = new Set(articles.map(a => a.publisher))
    return ["all", ...Array.from(set).sort()]
  }, [articles])

  const data = useMemo(() => {
    return articles
      .filter(a => {
        if (publisher !== "all" && a.publisher !== publisher) return false
        if (showOnly === "processed" && !a.processed) return false
        if (showOnly === "reviewed" && !(a.reviewCount > 0)) return false
        return true
      })
      .map(a => ({
        id:          a.id,
        x:           a.politicalLeaning ?? 0,
        y:           Math.max(a.emotionalIntensity ?? 0.01, 0.01),
        headline:    a.headline,
        publisher:   a.publisher,
        date:        a.date,
        color:       getColor(a.politicalLeaning ?? 0),
        radius:      getDotRadius(a.reviewCount ?? 0, !!a.processed),
        processed:   !!a.processed,
        reviewCount: a.reviewCount ?? 0,
      }))
  }, [articles, publisher, showOnly])

  const leftCount   = data.filter(p => p.x < -0.1).length
  const rightCount  = data.filter(p => p.x >  0.1).length
  const centerCount = data.length - leftCount - rightCount
  const avgIntensity = data.length
    ? (data.reduce((s, p) => s + p.y, 0) / data.length * 100).toFixed(1)
    : "—"

  const selectClass =
    "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 transition"

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ideological Map</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Political leaning vs emotional intensity. Click any dot to open the article.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-neutral-500">Publisher</label>
          <select value={publisher} onChange={e => setPublisher(e.target.value)} className={selectClass}>
            {publishers.map(p => (
              <option key={p} value={p}>{p === "all" ? "All Publishers" : p}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-neutral-500">Show</label>
          <select value={showOnly} onChange={e => setShowOnly(e.target.value as typeof showOnly)} className={selectClass}>
            <option value="all">All Articles</option>
            <option value="processed">Analyzed Only</option>
            <option value="reviewed">Reviewed Only</option>
          </select>
        </div>
        <span className="text-xs text-neutral-400 ml-auto">{data.length} articles</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Left-leaning",  value: leftCount,         color: "text-blue-500" },
          { label: "Center",        value: centerCount,        color: "text-neutral-500" },
          { label: "Right-leaning", value: rightCount,         color: "text-red-500" },
          { label: "Avg Intensity", value: `${avgIntensity}%`, color: "text-neutral-700" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-4 mb-4 text-xs text-neutral-500">
          {[
            ["#2563eb", "Strong Left"],
            ["#93c5fd", "Lean Left"],
            ["#94a3b8", "Center"],
            ["#fca5a5", "Lean Right"],
            ["#dc2626", "Strong Right"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
              {l}
            </span>
          ))}
          <span className="flex items-center gap-1.5 ml-auto">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4" fill="transparent" stroke="#94a3b8" strokeWidth="1.5" />
            </svg>
            Pending
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4" fill="#94a3b8" />
            </svg>
            Analyzed
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="12" viewBox="0 0 20 12">
              <circle cx="5"  cy="6" r="3" fill="#94a3b8" />
              <circle cx="15" cy="6" r="6" fill="#94a3b8" />
            </svg>
            Size = reviews
          </span>
        </div>

        <BeeswarmChart
          data={data}
          onClickPoint={id => navigate(`/article/${id}`)}
        />
      </div>

      <p className="text-xs text-neutral-400 text-center">
        Hollow dots are pending analysis. Dot size reflects human review count. Dashed lines mark leaning thresholds (±0.1).
      </p>

    </div>
  )
}
