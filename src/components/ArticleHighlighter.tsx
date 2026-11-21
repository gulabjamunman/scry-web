import { useMemo, useState, Fragment } from "react";
import type { Article } from "@/lib/types";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface ColorScheme {
  bg: string;
  underline: string;
  label: string;
  dot: string;
}

interface HighlightEntry {
  phrase: string;
  section: string;
  why: string;
  effect: string;
  color: ColorScheme;
}

interface Segment {
  type: "text" | "highlight";
  text: string;
  entry?: HighlightEntry;
}

// ─────────────────────────────────────────────
// SECTION → COLOUR MAP
// ─────────────────────────────────────────────

const SECTION_COLORS: Record<string, ColorScheme> = {
  "LANGUAGE INTENSITY": {
    bg: "rgba(245, 158, 11, 0.12)",
    underline: "#f59e0b",
    dot: "#f59e0b",
    label: "LANGUAGE INTENSITY",
  },
  "EMOTIONAL TRIGGERS": {
    bg: "rgba(239, 68, 68, 0.10)",
    underline: "#ef4444",
    dot: "#ef4444",
    label: "EMOTIONAL TRIGGER",
  },
  "FRAMING": {
    bg: "rgba(59, 130, 246, 0.10)",
    underline: "#3b82f6",
    dot: "#3b82f6",
    label: "FRAMING",
  },
  "SENSATIONALISM": {
    bg: "rgba(249, 115, 22, 0.10)",
    underline: "#f97316",
    dot: "#f97316",
    label: "SENSATIONALISM",
  },
  "SOCIAL AND IDENTITY CUES": {
    bg: "rgba(234, 179, 8, 0.12)",
    underline: "#eab308",
    dot: "#eab308",
    label: "SOCIAL & IDENTITY",
  },
  "SOCIAL & IDENTITY CUES": {
    bg: "rgba(234, 179, 8, 0.12)",
    underline: "#eab308",
    dot: "#eab308",
    label: "SOCIAL & IDENTITY",
  },
  "MOTIVATION AND ACTION SIGNALS": {
    bg: "rgba(168, 85, 247, 0.10)",
    underline: "#a855f7",
    dot: "#a855f7",
    label: "MOTIVATION & ACTION",
  },
  "MOTIVATION & ACTION SIGNALS": {
    bg: "rgba(168, 85, 247, 0.10)",
    underline: "#a855f7",
    dot: "#a855f7",
    label: "MOTIVATION & ACTION",
  },
  "ATTENTION AND SALIENCE": {
    bg: "rgba(16, 185, 129, 0.10)",
    underline: "#10b981",
    dot: "#10b981",
    label: "ATTENTION & SALIENCE",
  },
  "ATTENTION & SALIENCE": {
    bg: "rgba(16, 185, 129, 0.10)",
    underline: "#10b981",
    dot: "#10b981",
    label: "ATTENTION & SALIENCE",
  },
  "OVERALL INTERPRETATION": {
    bg: "rgba(99, 102, 241, 0.10)",
    underline: "#6366f1",
    dot: "#6366f1",
    label: "OVERALL",
  },
  "OVERALL BEHAVIOURAL INTERPRETATION": {
    bg: "rgba(99, 102, 241, 0.10)",
    underline: "#6366f1",
    dot: "#6366f1",
    label: "OVERALL",
  },
};

const FALLBACK_COLOR: ColorScheme = {
  bg: "rgba(148, 163, 184, 0.10)",
  underline: "#94a3b8",
  dot: "#94a3b8",
  label: "FLAGGED",
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function normaliseQuotes(text: string): string {
  return text
    .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
    .replace(/[\u2018\u2019\u2032]/g, "'");
}

const NOISE_WORDS = new Set([
  "read", "also", "and", "the", "a", "an", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "this", "that",
  "it", "its", "he", "she", "they", "we", "you", "as", "or", "but", "not",
  "be", "been", "have", "has", "had", "do", "did", "will", "would", "could",
  "should", "may", "might", "can", "so", "if", "then", "than", "when",
  "said", "says", "say", "wrote", "writes", "added",
]);

function isNoise(phrase: string): boolean {
  const lower = phrase.toLowerCase().trim();
  if (NOISE_WORDS.has(lower)) return true;
  if (phrase.length < 4) return true;
  if (/^read\s*:/i.test(lower)) return true;
  if (/^s\s+\w/i.test(lower)) return true;
  return false;
}

// ─────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────

const SECTION_PATTERN = new RegExp(
  `(FRAMING|LANGUAGE INTENSITY|SENSATIONALISM|OVERALL INTERPRETATION|` +
  `ATTENTION AND SALIENCE|ATTENTION & SALIENCE|EMOTIONAL TRIGGERS|` +
  `SOCIAL & IDENTITY CUES|SOCIAL AND IDENTITY CUES|MOTIVATION & ACTION SIGNALS|` +
  `MOTIVATION AND ACTION SIGNALS|OVERALL BEHAVIOURAL INTERPRETATION)`,
  "g"
);

function splitIntoSections(text: string): { section: string; body: string }[] {
  const parts = text.split(SECTION_PATTERN);
  const result: { section: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    result.push({ section: parts[i].trim(), body: (parts[i + 1] || "").trim() });
  }
  return result;
}

function extractQuotedPhrases(body: string): string[] {
  const norm    = normaliseQuotes(body);
  const results = new Set<string>();

  const doubleRe = /"([^"]{3,150})"/g;
  let m: RegExpExecArray | null;
  while ((m = doubleRe.exec(norm)) !== null) {
    const phrase = m[1].trim();
    if (!phrase || isNoise(phrase)) continue;
    const words = phrase.split(/\s+/).filter(Boolean).length;
    if (words >= 2) results.add(phrase);
  }

  const singleRe = /(?:^|[\s(])'([^']{3,150})'(?=[\s),.:!?]|$)/gm;
  while ((m = singleRe.exec(norm)) !== null) {
    const phrase = m[1].trim();
    if (!phrase || isNoise(phrase)) continue;
    const words = phrase.split(/\s+/).filter(Boolean).length;
    if (words >= 2) results.add(phrase);
  }

  return Array.from(results);
}

function extractReason(phrase: string, body: string): string {
  const norm  = normaliseQuotes(body);
  const lower = phrase.toLowerCase();
  const idx   = norm.toLowerCase().indexOf(lower);

  if (idx === -1) {
    const stop = norm.search(/[.!?]/);
    return stop > 0 ? norm.slice(0, stop).trim() : norm.slice(0, 120).trim();
  }

  let start = idx;
  while (start > 0 && !/[.!?\n]/.test(norm[start - 1])) start--;
  const afterPhrase = norm.slice(idx + phrase.length);
  const stopMatch   = afterPhrase.search(/[.!?\n]/);
  const end = idx + phrase.length + (stopMatch >= 0 ? stopMatch : Math.min(120, afterPhrase.length));
  let snippet = norm.slice(start, end).trim();
  if (snippet.length > 200) snippet = snippet.slice(0, 200).replace(/\s\S+$/, "") + "…";
  return snippet;
}

function parseHighlights(analysisText: string, articleContent: string): HighlightEntry[] {
  if (!analysisText) return [];

  const sections    = splitIntoSections(analysisText);
  const seen        = new Set<string>();
  const entries: HighlightEntry[] = [];
  const normContent = normaliseQuotes(articleContent).toLowerCase();

  for (const { section, body } of sections) {
    const color = SECTION_COLORS[section] || FALLBACK_COLOR;

    const phrasesMatch = body.match(/PHRASES:(\[.*?\])/s);
    if (phrasesMatch) {
      try {
        const phrases = JSON.parse(phrasesMatch[1]) as {
          phrase: string; why: string; effect: string;
        }[];
        for (const p of phrases) {
          if (!p.phrase || isNoise(p.phrase)) continue;
          const key     = p.phrase.toLowerCase();
          const normKey = normaliseQuotes(key);
          if (seen.has(key)) continue;
          if (!normContent.includes(normKey)) continue;
          seen.add(key);
          entries.push({ phrase: p.phrase, section, why: p.why || "", effect: p.effect || "", color });
        }
        continue;
      } catch { /* fall through */ }
    }

    const phrases = extractQuotedPhrases(body);
    for (const phrase of phrases) {
      const key     = phrase.toLowerCase();
      const normKey = normaliseQuotes(key);
      if (seen.has(key)) continue;
      if (!normContent.includes(normKey)) continue;
      seen.add(key);
      const reason = extractReason(phrase, body);
      entries.push({ phrase, section, why: reason, effect: "", color });
    }
  }

  return entries;
}

// ─────────────────────────────────────────────
// SEGMENTER
// ─────────────────────────────────────────────

function buildSegments(content: string, highlights: HighlightEntry[]): Segment[] {
  if (!highlights.length) return [{ type: "text", text: content }];

  const normContent  = normaliseQuotes(content);
  const lowerContent = normContent.toLowerCase();

  const sorted = [...highlights].sort((a, b) => b.phrase.length - a.phrase.length);
  const matches: { start: number; end: number; entry: HighlightEntry }[] = [];

  for (const entry of sorted) {
    const phraseLower = normaliseQuotes(entry.phrase.toLowerCase());
    let searchFrom = 0;
    while (searchFrom < lowerContent.length) {
      const idx = lowerContent.indexOf(phraseLower, searchFrom);
      if (idx === -1) break;
      const end      = idx + phraseLower.length;
      const overlaps = matches.some(ex => idx < ex.end && end > ex.start);
      if (!overlaps) matches.push({ start: idx, end, entry });
      searchFrom = idx + 1;
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ type: "text", text: content.slice(cursor, match.start) });
    }
    segments.push({
      type: "highlight",
      text: content.slice(match.start, match.end),
      entry: match.entry,
    });
    cursor = match.end;
  }
  if (cursor < content.length) {
    segments.push({ type: "text", text: content.slice(cursor) });
  }

  return segments;
}

// ─────────────────────────────────────────────
// PARAGRAPH GROUPER
// ─────────────────────────────────────────────

function groupSegmentsByParagraph(segments: Segment[]): Segment[][] {
  const paragraphs: Segment[][] = [[]];

  for (const seg of segments) {
    if (seg.type === "text" && seg.text.includes("\n")) {
      const parts = seg.text.split("\n");
      // remainder of text before the first newline goes into current paragraph
      paragraphs[paragraphs.length - 1].push({ type: "text", text: parts[0] });
      // each subsequent part starts a new paragraph
      for (let i = 1; i < parts.length; i++) {
        paragraphs.push([{ type: "text", text: parts[i] }]);
      }
    } else {
      paragraphs[paragraphs.length - 1].push(seg);
    }
  }

  // drop paragraphs that are entirely whitespace
  return paragraphs.filter(p => p.some(s => s.text.trim()));
}

// ─────────────────────────────────────────────
// INLINE EXPLANATION CARD
// ─────────────────────────────────────────────

function InlineCard({ entry, onClose }: { entry: HighlightEntry; onClose: () => void }) {
  return (
    <div
      style={{
        margin: "6px 0 14px",
        borderLeft: `3px solid ${entry.color.underline}`,
        borderRadius: "0 8px 8px 0",
        background: entry.color.bg,
        padding: "12px 14px",
        fontSize: "12px",
        lineHeight: "1.6",
        animation: "inlineCardIn 0.15s ease",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span style={{
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
          color: entry.color.underline, fontFamily: "system-ui, sans-serif",
        }}>
          {entry.color.label}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#94a3b8", fontSize: "16px", lineHeight: 1,
            padding: "0 0 0 8px", display: "flex", alignItems: "center",
          }}
        >
          ×
        </button>
      </div>

      {/* Why flagged */}
      <div style={{
        fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em",
        textTransform: "uppercase", color: "#94a3b8",
        fontFamily: "system-ui, sans-serif", marginBottom: "3px",
      }}>
        Why it's flagged
      </div>
      <div style={{
        color: "#334155", fontFamily: "system-ui, sans-serif",
        marginBottom: entry.effect ? "10px" : 0,
      }}>
        {entry.why}
      </div>

      {/* Effect on reader */}
      {entry.effect && (
        <>
          <div style={{
            fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em",
            textTransform: "uppercase", color: "#94a3b8",
            fontFamily: "system-ui, sans-serif", marginBottom: "3px",
          }}>
            Effect on reader
          </div>
          <div style={{ color: "#334155", fontFamily: "system-ui, sans-serif" }}>
            {entry.effect}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────

function Legend({ activeSections }: { activeSections: Set<string> }) {
  const shown = Object.entries(SECTION_COLORS).filter(([key]) => activeSections.has(key));
  if (!shown.length) return null;
  const seen   = new Set<string>();
  const unique = shown.filter(([, c]) => {
    if (seen.has(c.label)) return false;
    seen.add(c.label);
    return true;
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", marginBottom: "14px" }}>
      {unique.map(([, color]) => (
        <span key={color.label} style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em",
          color: "#64748b", fontFamily: "system-ui, sans-serif",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color.dot, flexShrink: 0 }} />
          {color.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

interface Props {
  article: Article;
  contentRef?: React.RefObject<HTMLElement>;
}

export function ArticleHighlighter({ article, contentRef }: Props) {
  const [activePhrase, setActivePhrase] = useState<string | null>(null);

  const highlights = useMemo(() => {
    const content       = article.content || "";
    const fromBias      = parseHighlights(article.biasExplanation || "", content);
    const fromBehaviour = parseHighlights(article.behaviouralAnalysis || "", content);
    const seen          = new Set<string>();
    const merged: HighlightEntry[] = [];
    for (const h of [...fromBias, ...fromBehaviour]) {
      const key = h.phrase.toLowerCase();
      if (!seen.has(key)) { seen.add(key); merged.push(h); }
    }
    return merged;
  }, [article.biasExplanation, article.behaviouralAnalysis, article.content]);

  const segments = useMemo(
    () => buildSegments(article.content || "", highlights),
    [article.content, highlights]
  );

  const paragraphGroups = useMemo(
    () => groupSegmentsByParagraph(segments),
    [segments]
  );

  const activeSections = useMemo(
    () => new Set(highlights.map(h => h.section)),
    [highlights]
  );

  if (!article.content) return null;

  return (
    <>
      {/* Keyframe injected once into the document */}
      <style>{`
        @keyframes inlineCardIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-card-foreground" style={{ marginBottom: "4px" }}>
          Influence Map
        </h2>
        <p className="text-xs text-muted-foreground" style={{ marginBottom: "14px" }}>
          {highlights.length > 0
            ? `${highlights.length} influential phrase${highlights.length === 1 ? "" : "s"} detected — tap highlighted text to explore`
            : "No influential phrases found in analysis"}
        </p>

        <Legend activeSections={activeSections} />

        <div style={{ borderTop: "1px solid #f1f5f9", marginBottom: "16px" }} />

        <div
          ref={contentRef as React.RefObject<HTMLDivElement>}
          className="text-sm text-card-foreground"
        >
          {paragraphGroups.map((para, pIdx) => {
            // Find the active entry if any highlight in this paragraph is selected
            const activeEntry = para
              .filter(s => s.type === "highlight")
              .find(s => s.entry?.phrase === activePhrase)
              ?.entry ?? null;

            return (
              <Fragment key={pIdx}>
                <p style={{ lineHeight: "1.8", margin: "0 0 0.4em" }}>
                  {para.map((seg, sIdx) =>
                    seg.type === "text" ? (
                      <span key={sIdx}>{seg.text}</span>
                    ) : (
                      <mark
                        key={sIdx}
                        onClick={() =>
                          setActivePhrase(
                            activePhrase === seg.entry!.phrase ? null : seg.entry!.phrase
                          )
                        }
                        style={{
                          background: seg.entry!.color.bg,
                          borderBottom: `2px solid ${seg.entry!.color.underline}`,
                          borderRadius: "2px",
                          padding: "0 1px",
                          cursor: "pointer",
                          font: "inherit",
                          color: "inherit",
                          // subtle ring when this specific mark is active
                          outline: activePhrase === seg.entry!.phrase
                            ? `2px solid ${seg.entry!.color.underline}`
                            : "none",
                          outlineOffset: "1px",
                        }}
                      >
                        {seg.text}
                      </mark>
                    )
                  )}
                </p>

                {/* Inline card renders directly after the paragraph that owns the active highlight */}
                {activeEntry && (
                  <InlineCard
                    entry={activeEntry}
                    onClose={() => setActivePhrase(null)}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
