// ============================================================
// src/pages/ClusterBriefPage.tsx
//
// Print-optimized narrative intelligence brief.
// Route: /cluster/:clusterId/brief
// ============================================================

import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { format, parseISO } from "date-fns"

interface NarrativeArcSection { text: string; citations: string[] }
interface NarrativeArc {
  origin:        NarrativeArcSection
  propagation:   NarrativeArcSection
  fault_lines:   NarrativeArcSection
  silences:      NarrativeArcSection
  current_state: NarrativeArcSection
}
interface PublisherExcerpt {
  publisher:      string
  headline:       string
  url:            string | null
  excerpt:        string
  framing:        number | null
  intensity:      number | null
  fact_ratio:     number | null
  sensationalism: number | null
  published_at:   string | null
}
interface BriefCache {
  generated_at:       string
  publisher_excerpts: PublisherExcerpt[]
}
interface ClusterData {
  id:                    string
  title:                 string
  summary:               string | null
  narrative_arc:         NarrativeArc | null
  publishers_silent:     string[]
  avg_framing_direction: number | null
  avg_intensity:         number | null
  avg_fact_ratio:        number | null
  left_count:            number
  neutral_count:         number
  right_count:           number
  article_count:         number
  publisher_count:       number
  dominant_topic:        string | null
  first_seen:            string
  last_seen:             string
  report_enabled:        boolean
  report_cache:          BriefCache | null
}

function framingLabel(v: number | null) {
  if (v == null)  return "Undetermined"
  if (v < -0.4)   return "Strongly left-leaning"
  if (v < -0.15)  return "Mildly left-leaning"
  if (v >  0.4)   return "Strongly right-leaning"
  if (v >  0.15)  return "Mildly right-leaning"
  return "Broadly neutral"
}
function framingColor(v: number | null) {
  if (v == null)  return "#6b7280"
  if (v < -0.15)  return "#2563eb"
  if (v >  0.15)  return "#dc2626"
  return "#6b7280"
}
function pct(v: number | null) {
  return v == null ? "—" : `${Math.round(v * 100)}%`
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  try { return format(parseISO(iso), "d MMM yyyy") } catch { return iso }
}

function ScoreRow({ label, value, color = "#111827" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 11, color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</span>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", color: "#111827" }}>SCRY</div>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #e5e7eb", borderTopColor: "#111827", animation: "spin 0.8s linear infinite" }} />
      <p style={{ fontSize: 13, color: "#6b7280" }}>{label}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, fontFamily: "system-ui, sans-serif", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px", color: "#111827" }}>SCRY</div>
      <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, maxWidth: 340 }}>{message}</p>
      <button onClick={() => window.close()} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
        Close tab
      </button>
    </div>
  )
}

export default function ClusterBriefPage() {
  const { clusterId } = useParams<{ clusterId: string }>()
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [cluster, setCluster] = useState<ClusterData | null>(null)

  useEffect(() => {
    if (!clusterId) { setError("No cluster ID provided."); setLoading(false); return }

    supabase
      .from("story_clusters")
      .select(`
        id, title, summary, narrative_arc,
        publishers_silent,
        avg_framing_direction, avg_intensity, avg_fact_ratio,
        left_count, neutral_count, right_count,
        article_count, publisher_count,
        dominant_topic, first_seen, last_seen,
        report_enabled, report_cache
      `)
      .eq("id", clusterId)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError(`Could not load this brief (${err.message}).`)
          return
        }
        if (!data) {
          setError("Story not found.")
          return
        }
        if (!data.report_enabled) {
          setError("This brief hasn't been made public yet.")
          return
        }
        if (!data.report_cache) {
          setError("Brief not yet generated. Ask an admin to generate it from the Reports tab.")
          return
        }
        setCluster(data as unknown as ClusterData)
      })
      .catch(e => setError(e.message ?? "Unexpected error."))
      .finally(() => setLoading(false))
  }, [clusterId])

  if (loading)           return <Spinner label="Loading brief…" />
  if (error || !cluster) return <ErrorScreen message={error ?? "Failed to load brief."} />

  const brief         = cluster.report_cache!
  const arc           = cluster.narrative_arc
  const generatedDate = fmtDate(brief.generated_at)
  const coverageRange = `${fmtDate(cluster.first_seen)} – ${fmtDate(cluster.last_seen)}`

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f9fafb; }
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          @page { margin: 16mm 14mm; size: A4; }
        }
        @media screen { body { padding: 32px 16px; } }
      `}</style>

      {/* Floating buttons */}
      <div className="no-print" style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, display: "flex", gap: 8 }}>
        <button onClick={() => window.print()} style={{ background: "#111827", color: "white", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><rect x="6" y="17" width="12" height="5"/><path d="M6 13H4a2 2 0 0 0-2 2v4h4m12-6h2a2 2 0 0 1 2 2v4h-4"/></svg>
          Save as PDF
        </button>
        <button onClick={() => window.close()} style={{ background: "white", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
          Close
        </button>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 760, margin: "0 auto", background: "white", fontFamily: "Georgia, 'Times New Roman', serif", color: "#111827", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>

        {/* Header strip */}
        <div style={{ background: "#111827", color: "white", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "system-ui, sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "-0.5px" }}>SCRY</div>
            <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.2)" }} />
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontFamily: "system-ui", letterSpacing: "0.12em", textTransform: "uppercase" }}>Narrative Intelligence Brief</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "system-ui", marginTop: 2 }}>scry.in · {generatedDate}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "system-ui", letterSpacing: "0.08em" }}>COVERAGE WINDOW</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontFamily: "system-ui", marginTop: 2 }}>{coverageRange}</div>
          </div>
        </div>

        <div style={{ padding: "32px 32px 40px" }}>

          {/* A. Headline + summary */}
          <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "2px solid #111827" }}>
            {cluster.dominant_topic && (
              <div style={{ display: "inline-block", fontSize: 10, fontFamily: "system-ui", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7280", marginBottom: 10 }}>
                {cluster.dominant_topic}
              </div>
            )}
            <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.28, letterSpacing: "-0.3px", marginBottom: 12 }}>
              {cluster.title}
            </h1>
            {cluster.summary && (
              <p style={{ fontSize: 15, lineHeight: 1.65, color: "#374151", fontStyle: "italic" }}>{cluster.summary}</p>
            )}
          </div>

          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 28, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {[
              { label: "Articles",       value: String(cluster.article_count), sub: `${cluster.publisher_count} outlets` },
              { label: "Avg framing",    value: cluster.avg_framing_direction != null ? cluster.avg_framing_direction.toFixed(2) : "—", sub: framingLabel(cluster.avg_framing_direction) },
              { label: "Avg intensity",  value: pct(cluster.avg_intensity),  sub: "language charge" },
              { label: "Avg fact ratio", value: pct(cluster.avg_fact_ratio),  sub: "verifiable claims" },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid #e5e7eb" : "none", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                <div style={{ fontSize: 10, fontFamily: "system-ui", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "system-ui", color: "#111827", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontFamily: "system-ui", color: "#6b7280", marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Framing distribution bar */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontFamily: "system-ui", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Framing Distribution</div>
            <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              {cluster.left_count > 0 && <div style={{ flex: cluster.left_count, background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: "white", fontFamily: "system-ui", fontWeight: 700 }}>{cluster.left_count}L</span></div>}
              {cluster.neutral_count > 0 && <div style={{ flex: cluster.neutral_count, background: "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: "white", fontFamily: "system-ui", fontWeight: 700 }}>{cluster.neutral_count}N</span></div>}
              {cluster.right_count > 0 && <div style={{ flex: cluster.right_count, background: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 9, color: "white", fontFamily: "system-ui", fontWeight: 700 }}>{cluster.right_count}R</span></div>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, fontFamily: "system-ui", color: "#2563eb" }}>← Left-leaning</span>
              <span style={{ fontSize: 9, fontFamily: "system-ui", color: "#9ca3af" }}>Neutral</span>
              <span style={{ fontSize: 9, fontFamily: "system-ui", color: "#dc2626" }}>Right-leaning →</span>
            </div>
          </div>

          {/* B. Where it stands now */}
          {arc?.current_state?.text && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 13, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>Where it stands now</h2>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "#374151" }}>{arc.current_state.text}</p>
              {arc.propagation?.text && (
                <div style={{ marginTop: 14, paddingLeft: 14, borderLeft: "3px solid #e5e7eb" }}>
                  <div style={{ fontSize: 10, fontFamily: "system-ui", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>How it spread</div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "#6b7280" }}>{arc.propagation.text}</p>
                </div>
              )}
            </div>
          )}

          {/* Fault lines */}
          {arc?.fault_lines?.text && (
            <div style={{ marginBottom: 28, padding: "16px 18px", background: "#fefce8", borderLeft: "3px solid #ca8a04", borderRadius: "0 6px 6px 0" }}>
              <div style={{ fontSize: 10, fontFamily: "system-ui", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Editorial fault lines</div>
              <p style={{ fontSize: 13, lineHeight: 1.72, color: "#78350f" }}>{arc.fault_lines.text}</p>
            </div>
          )}

          {/* C. Per-publisher excerpts */}
          {brief.publisher_excerpts.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 13, fontFamily: "system-ui", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, paddingBottom: 6, borderBottom: "1px solid #e5e7eb" }}>
                How different outlets covered it
              </h2>
              {brief.publisher_excerpts.map((p, i) => {
                const isLast = i === brief.publisher_excerpts.length - 1
                const fc     = framingColor(p.framing)
                return (
                  <div key={p.publisher} style={{ padding: "18px 0", borderBottom: isLast ? "none" : "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "system-ui", color: fc }}>{p.publisher}</span>
                          <span style={{ fontSize: 10, fontFamily: "system-ui", fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: p.framing == null ? "#f3f4f6" : p.framing < -0.15 ? "#dbeafe" : p.framing > 0.15 ? "#fee2e2" : "#f3f4f6", color: fc }}>
                            {framingLabel(p.framing)}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "#6b7280", fontFamily: "system-ui", lineHeight: 1.4 }}>{p.headline}</p>
                      </div>
                      <div style={{ minWidth: 100, flexShrink: 0 }}>
                        <ScoreRow label="Intensity"  value={pct(p.intensity)} />
                        <ScoreRow label="Fact ratio" value={pct(p.fact_ratio)} color={p.fact_ratio != null && p.fact_ratio > 0.6 ? "#16a34a" : p.fact_ratio != null && p.fact_ratio < 0.4 ? "#dc2626" : "#111827"} />
                      </div>
                    </div>
                    <blockquote style={{ fontSize: 14, lineHeight: 1.78, color: "#1f2937", paddingLeft: 16, borderLeft: `3px solid ${fc}`, fontStyle: "italic", margin: 0 }}>
                      "{p.excerpt}"
                    </blockquote>
                    {p.url && (
                      <div style={{ marginTop: 8 }}>
                        <a href={p.url} style={{ fontSize: 10, fontFamily: "system-ui", color: "#2563eb", textDecoration: "none" }}>Read full article →</a>
                        {p.published_at && <span style={{ fontSize: 10, fontFamily: "system-ui", color: "#9ca3af", marginLeft: 8 }}>{fmtDate(p.published_at)}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Silences */}
          {cluster.publishers_silent && cluster.publishers_silent.length > 0 && (
            <div style={{ marginBottom: 28, padding: "16px 18px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "system-ui", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                Who didn't cover this — {cluster.publishers_silent.length} outlet{cluster.publishers_silent.length !== 1 ? "s" : ""}
              </div>
              <p style={{ fontSize: 12, fontFamily: "system-ui", color: "#6b7280", lineHeight: 1.6, marginBottom: 8 }}>
                An outlet's silence on a widely-reported story is an editorial signal in itself.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {cluster.publishers_silent.map(pub => (
                  <span key={pub} style={{ fontSize: 11, fontFamily: "system-ui", padding: "3px 10px", borderRadius: 4, border: "1px solid #e5e7eb", background: "white", color: "#6b7280" }}>{pub}</span>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ paddingTop: 20, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, fontFamily: "system-ui", fontWeight: 700, color: "#111827" }}>SCRY — Narrative Intelligence for Indian Media</div>
              <div style={{ fontSize: 11, fontFamily: "system-ui", color: "#9ca3af", marginTop: 3 }}>
                Full analysis at <a href={`https://scry.in/cluster/${clusterId}`} style={{ color: "#2563eb", textDecoration: "none" }}>scry.in/cluster/{clusterId?.slice(0, 8)}</a>
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: "system-ui", color: "#d1d5db", textAlign: "right" }}>
              <div>Generated {generatedDate}</div>
              <div style={{ marginTop: 2 }}>Scored by Claude Haiku 4.5</div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
