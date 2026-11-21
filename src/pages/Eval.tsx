// pages/eval.tsx
// Drop into your pages/ directory. Visit /eval to use.
//
// Imports your existing Supabase client — adjust the path to match yours.
// npm install recharts @types/recharts   ← if not already installed

import { useState, useEffect, useMemo, ReactNode } from "react";
import { supabase } from "@/lib/supabase"; // ← adjust path if needed
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar, Cell, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EvalRow {
  id: string;
  eval_run_id: string;
  article_id: string;
  headline: string | null;
  publisher_name: string | null;
  model: string;
  framing_direction: number | null;
  language_intensity: number | null;
  sensationalism_score: number | null;
  topic: string | null;
  context_score: number | null;
  headline_alignment: number | null;
  fact_ratio: number | null;
  vulnerable_score: number | null;
  bias_explanation: string | null;
  behavioural_analysis: string | null;
  context_note: string | null;
  headline_note: string | null;
  fact_highlights: unknown[] | null;
  vulnerable_spans: unknown[] | null;
  json_valid: boolean;
  json_missing_fields: string[] | null;
  latency_seconds: number | null;
  error: string | null;
  created_at: string;
}

interface ArticlePair {
  gpt: EvalRow;
  hku: EvalRow;
  framingDelta: number | null;
  intensityDelta: number | null;
  sensationalDelta: number | null;
  contextDelta: number | null;
  factDelta: number | null;
  topicMatch: boolean;
}

interface ModelSummary {
  reliability: number | null;
  avgLatency: number | null;
  avgFraming: number | null;
  avgIntensity: number | null;
  avgSensation: number | null;
  avgContext: number | null;
  avgFact: number | null;
  avgVulnerable: number | null;
}

interface EvalSummary {
  gpt: ModelSummary;
  hku: ModelSummary;
  topicAgreement: number | null;
  radarData: { metric: string; gpt: number; hku: number }[];
}

interface TopicDatum {
  topic: string;
  agree: number;
  disagree: number;
}

interface PublisherDatum {
  publisher: string;
  avgDelta: number;
}

interface ScatterDatum {
  gpt: number;
  hku: number;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GPT_MODEL   = "gpt-5-mini";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const C = {
  bg:       "#0A0A0C",
  surface:  "#111115",
  raised:   "#18181E",
  border:   "#1C1C24",
  borderHi: "#26262F",
  gpt:      "#38BDF8",
  haiku:    "#FB7185",
  neutral:  "#71717A",
  text:     "#F1F1F5",
  textDim:  "#52525E",
  textMid:  "#A1A1AA",
  good:     "#34D399",
  warn:     "#FBBF24",
  bad:      "#F87171",
} as const;

type TabId = "overview" | "scores" | "disagreement" | "topics" | "charts";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",     label: "Overview"       },
  { id: "scores",       label: "Score Table"    },
  { id: "disagreement", label: "Disagreements"  },
  { id: "topics",       label: "Topics"         },
  { id: "charts",       label: "Charts"         },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

const fmt  = (v: number | null | undefined, d = 3): string =>
  v != null ? Number(v).toFixed(d) : "—";

const pct  = (v: number | null | undefined): string =>
  v != null ? `${Number(v).toFixed(1)}%` : "—";

const absDelta = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a != null && b != null ? Math.abs(a - b) : null;

const avg = (arr: EvalRow[], key: keyof EvalRow): number | null => {
  const vals = arr
    .map(r => r[key])
    .filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

const reliability = (arr: EvalRow[]): number | null =>
  arr.length ? (arr.filter(r => r.json_valid).length / arr.length) * 100 : null;

function deltaColor(d: number | null): string {
  if (d == null) return C.neutral;
  if (d < 0.1)   return C.good;
  if (d < 0.25)  return C.warn;
  return C.bad;
}

function abbreviate(name: string): string {
  return name
    .replace("Times of India", "TOI")
    .replace("Indian Express", "IE")
    .replace("National Herald", "Nat. Herald")
    .replace("India TV News", "India TV");
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────────────────────────────────────

function ScorePill({ value, color }: { value: number | null; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      background: `${color}15`, border: `1px solid ${color}35`,
      color, fontFamily: "monospace", fontSize: 13, fontWeight: 600,
    }}>
      {fmt(value)}
    </span>
  );
}

function DeltaBadge({ value }: { value: number | null }) {
  const color = deltaColor(value);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 7px",
      borderRadius: 4, background: `${color}12`, border: `1px solid ${color}30`,
      color, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      Δ {value != null ? value.toFixed(2) : "—"}
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 style={{
      fontFamily: "'DM Mono', 'Courier New', monospace",
      fontSize: 13, letterSpacing: "0.18em", color: C.textMid,
      margin: "0 0 20px", textTransform: "uppercase",
      borderBottom: `1px solid ${C.border}`, paddingBottom: 12,
    }}>
      {children}
    </h2>
  );
}

function Card({ children, style = {} }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: "22px 26px", ...style,
    }}>
      {children}
    </div>
  );
}

function StatBox({
  label, gptVal, hkuVal, format = "num",
}: {
  label: string;
  gptVal: number | null;
  hkuVal: number | null;
  format?: "num" | "pct";
}) {
  const f  = format === "pct" ? pct : (v: number | null) => fmt(v, 3);
  const d  = absDelta(gptVal, hkuVal);
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "14px 16px",
    }}>
      <div style={{
        fontSize: 10, color: C.textDim, letterSpacing: "0.1em",
        textTransform: "uppercase", marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 10, color: C.gpt, marginBottom: 4 }}>GPT-4o-mini</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
            {f(gptVal)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.haiku, marginBottom: 4 }}>Haiku 4.5</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: "monospace" }}>
            {f(hkuVal)}
          </div>
        </div>
        {d != null && (
          <div style={{ marginLeft: "auto", paddingBottom: 4 }}>
            <DeltaBadge value={d} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [runIds,       setRunIds]       = useState<string[]>([]);
  const [selectedRun,  setSelectedRun]  = useState<string | null>(null);
  const [rows,         setRows]         = useState<EvalRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [activeTab,    setActiveTab]    = useState<TabId>("overview");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  // Load available run IDs
  useEffect(() => {
    supabase
      .from("model_eval_results")
      .select("eval_run_id, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const unique = [...new Set(data.map((r: { eval_run_id: string }) => r.eval_run_id))];
        setRunIds(unique);
        if (unique.length > 0) setSelectedRun(unique[0]);
      });
  }, []);

  // Load rows for selected run
  useEffect(() => {
    if (!selectedRun) return;
    setLoading(true);
    supabase
      .from("model_eval_results")
      .select("*")
      .eq("eval_run_id", selectedRun)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setRows((data as EvalRow[]) || []);
        setLoading(false);
      });
  }, [selectedRun]);

  // Derived data
  const { gptRows, hkuRows, pairs, summary, topicData, publisherData, scatterData } =
    useMemo<{
      gptRows: EvalRow[];
      hkuRows: EvalRow[];
      pairs: ArticlePair[];
      summary: EvalSummary;
      topicData: TopicDatum[];
      publisherData: PublisherDatum[];
      scatterData: ScatterDatum[];
    }>(() => {
      const gptRows = rows.filter(r => r.model === GPT_MODEL);
      const hkuRows = rows.filter(r => r.model === HAIKU_MODEL);

      const hkuMap = Object.fromEntries(hkuRows.map(r => [r.article_id, r]));
      const pairs: ArticlePair[] = gptRows
        .map(g => ({ gpt: g, hku: hkuMap[g.article_id] }))
        .filter((p): p is { gpt: EvalRow; hku: EvalRow } => !!p.hku)
        .map(p => ({
          ...p,
          framingDelta:     absDelta(p.gpt.framing_direction,    p.hku.framing_direction),
          intensityDelta:   absDelta(p.gpt.language_intensity,   p.hku.language_intensity),
          sensationalDelta: absDelta(p.gpt.sensationalism_score, p.hku.sensationalism_score),
          contextDelta:     absDelta(p.gpt.context_score,        p.hku.context_score),
          factDelta:        absDelta(p.gpt.fact_ratio,           p.hku.fact_ratio),
          topicMatch:       p.gpt.topic === p.hku.topic,
        }))
        .sort((a, b) => (b.framingDelta ?? 0) - (a.framingDelta ?? 0));

      const summary: EvalSummary = {
        gpt: {
          reliability:   reliability(gptRows),
          avgLatency:    avg(gptRows, "latency_seconds"),
          avgFraming:    avg(gptRows, "framing_direction"),
          avgIntensity:  avg(gptRows, "language_intensity"),
          avgSensation:  avg(gptRows, "sensationalism_score"),
          avgContext:    avg(gptRows, "context_score"),
          avgFact:       avg(gptRows, "fact_ratio"),
          avgVulnerable: avg(gptRows, "vulnerable_score"),
        },
        hku: {
          reliability:   reliability(hkuRows),
          avgLatency:    avg(hkuRows, "latency_seconds"),
          avgFraming:    avg(hkuRows, "framing_direction"),
          avgIntensity:  avg(hkuRows, "language_intensity"),
          avgSensation:  avg(hkuRows, "sensationalism_score"),
          avgContext:    avg(hkuRows, "context_score"),
          avgFact:       avg(hkuRows, "fact_ratio"),
          avgVulnerable: avg(hkuRows, "vulnerable_score"),
        },
        topicAgreement: pairs.length
          ? (pairs.filter(p => p.topicMatch).length / pairs.length) * 100
          : null,
        radarData: [
          { metric: "Framing",    gpt: Math.abs(avg(gptRows, "framing_direction")    ?? 0) * 100, hku: Math.abs(avg(hkuRows, "framing_direction")    ?? 0) * 100 },
          { metric: "Intensity",  gpt: (avg(gptRows, "language_intensity")           ?? 0) * 100, hku: (avg(hkuRows, "language_intensity")           ?? 0) * 100 },
          { metric: "Sensation",  gpt: (avg(gptRows, "sensationalism_score")         ?? 0) * 100, hku: (avg(hkuRows, "sensationalism_score")         ?? 0) * 100 },
          { metric: "Context",    gpt: (avg(gptRows, "context_score")                ?? 0) * 100, hku: (avg(hkuRows, "context_score")                ?? 0) * 100 },
          { metric: "Fact Ratio", gpt: (avg(gptRows, "fact_ratio")                  ?? 0) * 100, hku: (avg(hkuRows, "fact_ratio")                  ?? 0) * 100 },
        ],
      };

      // Topic agreement breakdown
      const topicMap: Record<string, TopicDatum> = {};
      pairs.forEach(p => {
        const t = p.gpt.topic ?? "Unknown";
        if (!topicMap[t]) topicMap[t] = { topic: t, agree: 0, disagree: 0 };
        p.topicMatch ? topicMap[t].agree++ : topicMap[t].disagree++;
      });
      const topicData = Object.values(topicMap)
        .sort((a, b) => (b.agree + b.disagree) - (a.agree + a.disagree));

      // Publisher framing delta
      const pubMap: Record<string, { publisher: string; deltas: number[] }> = {};
      pairs.forEach(p => {
        const pub = abbreviate(p.gpt.publisher_name ?? "Unknown");
        if (!pubMap[pub]) pubMap[pub] = { publisher: pub, deltas: [] };
        if (p.framingDelta != null) pubMap[pub].deltas.push(p.framingDelta);
      });
      const publisherData: PublisherDatum[] = Object.values(pubMap)
        .map(p => ({
          publisher: p.publisher,
          avgDelta: p.deltas.length
            ? p.deltas.reduce((a, b) => a + b, 0) / p.deltas.length
            : 0,
        }))
        .sort((a, b) => b.avgDelta - a.avgDelta);

      // Scatter data
      const scatterData: ScatterDatum[] = pairs
        .filter(p => p.gpt.framing_direction != null && p.hku.framing_direction != null)
        .map(p => ({
          gpt:   p.gpt.framing_direction as number,
          hku:   p.hku.framing_direction as number,
          label: (p.gpt.headline ?? "").slice(0, 45),
        }));

      return { gptRows, hkuRows, pairs, summary, topicData, publisherData, scatterData };
    }, [rows]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", color: C.text,
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    }}>

      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "18px 36px",
        display: "flex", alignItems: "center", gap: 24,
        background: C.surface,
        position: "sticky", top: 0, zIndex: 100,
        backdropFilter: "blur(12px)",
      }}>
        <div>
          <div style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 14, letterSpacing: "0.2em",
            color: C.textMid, textTransform: "uppercase",
          }}>
            Model Eval
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>
            <span style={{ color: C.gpt }}>●</span> GPT-4o-mini &ensp;
            <span style={{ color: C.haiku }}>●</span> Haiku 4.5
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {!loading && rows.length > 0 && (
            <span style={{ fontSize: 12, color: C.textDim, fontFamily: "monospace" }}>
              {pairs.length} pairs
            </span>
          )}
          <select
            value={selectedRun ?? ""}
            onChange={e => setSelectedRun(e.target.value)}
            style={{
              background: C.raised, border: `1px solid ${C.borderHi}`,
              color: C.text, padding: "7px 12px", borderRadius: 6,
              fontSize: 12, fontFamily: "monospace", cursor: "pointer",
              outline: "none",
            }}
          >
            {runIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 0, padding: "0 36px",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "13px 18px",
              color: activeTab === t.id ? C.text : C.textDim,
              fontSize: 13,
              fontWeight: activeTab === t.id ? 600 : 400,
              borderBottom: activeTab === t.id
                ? `2px solid ${C.haiku}` : "2px solid transparent",
              transition: "color 0.15s",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          height: 300, color: C.textDim, fontFamily: "monospace", fontSize: 13,
          letterSpacing: "0.1em",
        }}>
          LOADING…
        </div>
      )}

      {!loading && (
        <div style={{ padding: "32px 36px", maxWidth: 1280, margin: "0 auto" }}>

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <SectionTitle>Run Summary</SectionTitle>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <StatBox label="JSON Reliability"
                  gptVal={summary.gpt.reliability} hkuVal={summary.hku.reliability}
                  format="pct" />
                <StatBox label="Avg Latency (s)"
                  gptVal={summary.gpt.avgLatency}  hkuVal={summary.hku.avgLatency} />
                <Card>
                  <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase",
                                letterSpacing: "0.1em", marginBottom: 10 }}>
                    Topic Agreement
                  </div>
                  <div style={{
                    fontSize: 36, fontWeight: 700, fontFamily: "monospace",
                    color: (summary.topicAgreement ?? 0) > 80 ? C.good : C.warn,
                  }}>
                    {pct(summary.topicAgreement)}
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                    across {pairs.length} matched article pairs
                  </div>
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                <StatBox label="Avg Framing Direction"
                  gptVal={summary.gpt.avgFraming}    hkuVal={summary.hku.avgFraming} />
                <StatBox label="Avg Language Intensity"
                  gptVal={summary.gpt.avgIntensity}  hkuVal={summary.hku.avgIntensity} />
                <StatBox label="Avg Sensationalism"
                  gptVal={summary.gpt.avgSensation}  hkuVal={summary.hku.avgSensation} />
                <StatBox label="Avg Context Score"
                  gptVal={summary.gpt.avgContext}    hkuVal={summary.hku.avgContext} />
                <StatBox label="Avg Fact Ratio"
                  gptVal={summary.gpt.avgFact}       hkuVal={summary.hku.avgFact} />
                <StatBox label="Avg Vulnerable Score"
                  gptVal={summary.gpt.avgVulnerable} hkuVal={summary.hku.avgVulnerable} />
              </div>

              <Card>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16,
                              textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Score Profile Overlay
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={summary.radarData}>
                    <PolarGrid stroke={C.border} />
                    <PolarAngleAxis dataKey="metric"
                      tick={{ fill: C.textDim, fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="GPT-4o-mini" dataKey="gpt"
                      stroke={C.gpt}   fill={C.gpt}   fillOpacity={0.12} strokeWidth={2} />
                    <Radar name="Haiku 4.5"   dataKey="hku"
                      stroke={C.haiku} fill={C.haiku} fillOpacity={0.12} strokeWidth={2} />
                    <Legend wrapperStyle={{ color: C.textDim, fontSize: 12 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* ── SCORE TABLE ───────────────────────────────────────────────── */}
          {activeTab === "scores" && (
            <div>
              <SectionTitle>Article Score Comparison</SectionTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                      {["Headline", "Publisher",
                        "Framing GPT", "Framing HKU", "Δ",
                        "Intensity GPT", "Intensity HKU",
                        "Context GPT", "Context HKU",
                        "Fact GPT", "Fact HKU", "Topic"].map(h => (
                        <th key={h} style={{
                          padding: "10px 12px", textAlign: "left",
                          color: C.textDim, fontSize: 10,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pairs.map((p, i) => (
                      <tr key={p.gpt.article_id} style={{
                        borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 0 ? "transparent" : `${C.surface}90`,
                      }}>
                        <td style={{
                          padding: "10px 12px", maxWidth: 240,
                          overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", color: C.text,
                        }}>
                          {p.gpt.headline}
                        </td>
                        <td style={{ padding: "10px 12px", color: C.textDim,
                                     fontSize: 12, whiteSpace: "nowrap" }}>
                          {abbreviate(p.gpt.publisher_name ?? "")}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <ScorePill value={p.gpt.framing_direction} color={C.gpt} />
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <ScorePill value={p.hku.framing_direction} color={C.haiku} />
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <DeltaBadge value={p.framingDelta} />
                        </td>
                        {[
                          p.gpt.language_intensity, p.hku.language_intensity,
                          p.gpt.context_score,      p.hku.context_score,
                          p.gpt.fact_ratio,         p.hku.fact_ratio,
                        ].map((v, idx) => (
                          <td key={idx} style={{
                            padding: "10px 12px", color: C.textMid,
                            fontFamily: "monospace", fontSize: 12,
                          }}>
                            {fmt(v)}
                          </td>
                        ))}
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{ color: p.topicMatch ? C.good : C.bad, fontSize: 15 }}>
                            {p.topicMatch ? "✓" : "✗"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── DISAGREEMENTS ─────────────────────────────────────────────── */}
          {activeTab === "disagreement" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <SectionTitle>High-Disagreement Articles</SectionTitle>
              <p style={{ fontSize: 13, color: C.textDim, margin: "0 0 8px" }}>
                Sorted by framing delta. Click any row to expand both models&apos; reasoning.
              </p>
              {pairs.map(p => {
                const isOpen = expandedId === p.gpt.article_id;
                const d      = p.framingDelta;
                return (
                  <div key={p.gpt.article_id} style={{
                    border: `1px solid ${d != null && d > 0.25 ? C.bad + "50" : C.border}`,
                    borderRadius: 8, overflow: "hidden", background: C.surface,
                  }}>
                    <div
                      onClick={() => setExpandedId(isOpen ? null : p.gpt.article_id)}
                      style={{
                        padding: "14px 18px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 14,
                        transition: "background 0.1s",
                      }}
                    >
                      <DeltaBadge value={d} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 500, color: C.text,
                          marginBottom: 3, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {p.gpt.headline}
                        </div>
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          {p.gpt.publisher_name}
                          {!p.topicMatch && (
                            <span style={{ marginLeft: 12, color: C.warn }}>
                              ⚠ Topic: &quot;{p.gpt.topic}&quot; vs &quot;{p.hku.topic}&quot;
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center",
                                    flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: C.gpt, marginBottom: 3 }}>GPT</div>
                          <ScorePill value={p.gpt.framing_direction} color={C.gpt} />
                        </div>
                        <span style={{ color: C.textDim, fontSize: 12 }}>vs</span>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: C.haiku, marginBottom: 3 }}>Haiku</div>
                          <ScorePill value={p.hku.framing_direction} color={C.haiku} />
                        </div>
                        <span style={{ color: C.textDim, marginLeft: 6 }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {isOpen && (
                      <div style={{
                        borderTop: `1px solid ${C.border}`,
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                      }}>
                        {([
                          { label: "GPT-4o-mini", color: C.gpt,
                            text: p.gpt.bias_explanation, lat: p.gpt.latency_seconds },
                          { label: "Haiku 4.5",   color: C.haiku,
                            text: p.hku.bias_explanation, lat: p.hku.latency_seconds },
                        ] as const).map(({ label, color, text, lat }, idx) => (
                          <div key={label} style={{
                            padding: "18px 20px",
                            borderRight: idx === 0 ? `1px solid ${C.border}` : "none",
                          }}>
                            <div style={{
                              fontSize: 10, color, letterSpacing: "0.1em",
                              textTransform: "uppercase", marginBottom: 12,
                              display: "flex", justifyContent: "space-between",
                            }}>
                              <span>{label}</span>
                              <span style={{ color: C.textDim }}>{lat?.toFixed(1)}s</span>
                            </div>
                            <pre style={{
                              fontSize: 12, color: C.textMid, lineHeight: 1.75,
                              whiteSpace: "pre-wrap", margin: 0,
                              fontFamily: "'DM Sans', sans-serif",
                            }}>
                              {text ?? "No explanation returned."}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TOPICS ───────────────────────────────────────────────────── */}
          {activeTab === "topics" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <SectionTitle>Topic Agreement by Category</SectionTitle>
              <Card>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={topicData} layout="vertical"
                    margin={{ left: 20, right: 50, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.textDim, fontSize: 11 }}
                      axisLine={{ stroke: C.border }} />
                    <YAxis type="category" dataKey="topic" width={120}
                      tick={{ fill: C.textDim, fontSize: 12 }}
                      axisLine={{ stroke: C.border }} />
                    <Tooltip
                      contentStyle={{ background: C.raised, border: `1px solid ${C.border}`,
                                      borderRadius: 6, color: C.text, fontSize: 12 }} />
                    <Bar dataKey="agree"    name="Agreed"    stackId="a" fill={C.good} />
                    <Bar dataKey="disagree" name="Disagreed" stackId="a" fill={C.bad}
                      radius={[0, 4, 4, 0]} />
                    <Legend wrapperStyle={{ color: C.textDim, fontSize: 12 }} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <SectionTitle>Avg Framing Delta by Publisher</SectionTitle>
              <Card>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={publisherData}
                    margin={{ left: 10, right: 20, top: 5, bottom: 55 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="publisher"
                      tick={{ fill: C.textDim, fontSize: 11, angle: -35, textAnchor: "end" }}
                      axisLine={{ stroke: C.border }} interval={0} />
                    <YAxis tick={{ fill: C.textDim, fontSize: 11 }}
                      axisLine={{ stroke: C.border }} domain={[0, 0.6]} />
                    <Tooltip
                      contentStyle={{ background: C.raised, border: `1px solid ${C.border}`,
                                      borderRadius: 6, color: C.text, fontSize: 12 }}
                      formatter={(v: number) => [v.toFixed(3), "Avg Framing Δ"]}
                    />
                    <ReferenceLine y={0.1}  stroke={C.good} strokeDasharray="4 4" />
                    <ReferenceLine y={0.25} stroke={C.warn} strokeDasharray="4 4" />
                    <Bar dataKey="avgDelta" name="Avg Framing Δ" radius={[4, 4, 0, 0]}>
                      {publisherData.map((entry, i) => (
                        <Cell key={i}
                          fill={entry.avgDelta > 0.25 ? C.bad
                              : entry.avgDelta > 0.1  ? C.warn
                              : C.good}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 20, marginTop: 14,
                              fontSize: 11, color: C.textDim }}>
                  <span><span style={{ color: C.good }}>—</span> &lt;0.10 good</span>
                  <span><span style={{ color: C.warn }}>—</span> 0.10–0.25 moderate</span>
                  <span><span style={{ color: C.bad  }}>—</span> &gt;0.25 high disagreement</span>
                </div>
              </Card>
            </div>
          )}

          {/* ── CHARTS ───────────────────────────────────────────────────── */}
          {activeTab === "charts" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              <SectionTitle>Framing Correlation — GPT vs Haiku</SectionTitle>
              <Card>
                <p style={{ fontSize: 12, color: C.textDim, margin: "0 0 16px" }}>
                  Each dot is one article. Points near the diagonal = strong agreement.
                  Points far from it = the models read the framing differently.
                </p>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="gpt" domain={[-1, 1]} name="GPT Framing"
                      label={{ value: "GPT-4o-mini framing", position: "insideBottom",
                               offset: -15, fill: C.textDim, fontSize: 12 }}
                      tick={{ fill: C.textDim, fontSize: 11 }}
                      axisLine={{ stroke: C.border }} />
                    <YAxis type="number" dataKey="hku" domain={[-1, 1]} name="Haiku Framing"
                      label={{ value: "Haiku 4.5 framing", angle: -90,
                               position: "insideLeft", fill: C.textDim, fontSize: 12 }}
                      tick={{ fill: C.textDim, fontSize: 11 }}
                      axisLine={{ stroke: C.border }} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ background: C.raised, border: `1px solid ${C.border}`,
                                      borderRadius: 6, color: C.text, fontSize: 12 }}
                      formatter={(v: number, n: string) => [v.toFixed(3), n]}
                      labelFormatter={(_: unknown, payload: { payload: ScatterDatum }[]) =>
                        payload?.[0]?.payload?.label ?? ""}
                    />
                    <ReferenceLine
                      segment={[{ x: -1, y: -1 }, { x: 1, y: 1 }]}
                      stroke={C.neutral} strokeDasharray="5 3" strokeWidth={1}
                    />
                    <Scatter data={scatterData} fill={C.haiku} fillOpacity={0.65} />
                  </ScatterChart>
                </ResponsiveContainer>
              </Card>

              <SectionTitle>Avg Latency Comparison</SectionTitle>
              <Card>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={[
                      { name: "GPT-4o-mini", latency: summary.gpt.avgLatency },
                      { name: "Haiku 4.5",   latency: summary.hku.avgLatency },
                    ]}
                    margin={{ top: 5, right: 30, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: C.textDim, fontSize: 13 }}
                      axisLine={{ stroke: C.border }} />
                    <YAxis tick={{ fill: C.textDim, fontSize: 11 }}
                      axisLine={{ stroke: C.border }}
                      label={{ value: "seconds", angle: -90, position: "insideLeft",
                               fill: C.textDim, fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: C.raised, border: `1px solid ${C.border}`,
                                      borderRadius: 6, color: C.text, fontSize: 12 }}
                      formatter={(v: number) => [`${v?.toFixed(2)}s`, "Avg latency"]}
                    />
                    <Bar dataKey="latency" radius={[6, 6, 0, 0]}>
                      <Cell fill={C.gpt} />
                      <Cell fill={C.haiku} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
