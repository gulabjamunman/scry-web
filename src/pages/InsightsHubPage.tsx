import { useNavigate } from "react-router-dom"
import { BarChart3, Map, Layers, ArrowRight } from "lucide-react"

const tools = [
  {
    title:       "Ideological Map",
    description: "Every analyzed article plotted by political framing direction and emotional intensity. Spot how different publishers cluster — and which articles sit far outside their outlet's usual territory.",
    url:         "/map",
    icon:        Map,
    accent:      "hsl(215, 65%, 55%)",
    tag:         "Article-level",
    detail:      "Beeswarm scatter · hover for article detail · filter by publisher",
  },
  {
    title:       "Analytics Dashboard",
    description: "Corpus-wide distributions of sensationalism, tribal activation, and threat signal. Shows how the AI model's scores compare to human reviewer assessments across all five dimensions.",
    url:         "/analytics",
    icon:        BarChart3,
    accent:      "hsl(145, 55%, 45%)",
    tag:         "Corpus-level",
    detail:      "AI vs human calibration · distribution histograms · percentile buckets",
  },
  {
    title:       "Media Landscape",
    description: "Four views of the publisher ecosystem: narrative positioning map, topic framing box plots, sensationalism time series, and topic distribution by outlet. The macro picture.",
    url:         "/media-landscape",
    icon:        Layers,
    accent:      "hsl(30, 85%, 50%)",
    tag:         "Publisher-level",
    detail:      "Narrative scatter · framing box plots · sensationalism tracker · topic share",
  },
]

export default function InsightsHubPage() {
  const navigate = useNavigate()

  return (
    <div className="p-6 lg:p-10 space-y-10 max-w-4xl">

      {/* Header */}
      <div className="space-y-2">
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">
          Analytical Tools
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Three lenses for reading the Indian media ecosystem — from individual article signals
          to publisher patterns to corpus-wide distributions. Each tool answers a different question.
        </p>
      </div>

      {/* Tool cards */}
      <div className="space-y-4">
        {tools.map(tool => (
          <button
            key={tool.url}
            onClick={() => navigate(tool.url)}
            className="w-full text-left rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow group"
            style={{ borderLeftWidth: 3, borderLeftColor: tool.accent }}
          >
            <div className="p-6 flex items-start gap-5">

              {/* Icon */}
              <div
                className="rounded-lg p-2.5 shrink-0 mt-0.5"
                style={{ background: `${tool.accent}18`, border: `1px solid ${tool.accent}33` }}
              >
                <tool.icon className="h-5 w-5" style={{ color: tool.accent }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold">{tool.title}</h2>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{
                      color: tool.accent,
                      background: `${tool.accent}15`,
                      border: `1px solid ${tool.accent}33`,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {tool.tag}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
                <p className="text-xs text-muted-foreground/70 font-mono">{tool.detail}</p>
              </div>

              {/* Arrow */}
              <ArrowRight
                className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 mt-1 transition-colors"
              />
            </div>
          </button>
        ))}
      </div>

      {/* Footer note */}
      <div className="rounded-lg border bg-muted/30 px-5 py-4 text-xs text-muted-foreground leading-relaxed">
        All three tools draw from the same analyzed article corpus. Scores are computed by Claude Haiku 4.5
        with NRC EmoLex lexical signals. Formula weights are provisional — see the{" "}
        <button
          onClick={() => navigate("/transparency")}
          className="underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Transparency page
        </button>{" "}
        for full methodology and known limitations.
      </div>

    </div>
  )
}
