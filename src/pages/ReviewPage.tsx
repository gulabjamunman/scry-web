import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getArticleById, getReviewQueue, submitReview } from "@/lib/api";
import type { Article } from "@/lib/types";
import { SpectrumBar } from "@/components/SpectrumBar";
import { HeatBar } from "@/components/HeatBar";
import { ArrowLeft, Send, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type PoliticalLeaning = "left" | "neutral" | "right";

// ─── Derive validation purely from an Article object ───────────────────────
function deriveValidation(article: Article): any {
  const metric = article.rotatedMetric?.trim().toLowerCase();

  switch (metric) {
    case "context":
      return {
        metric: "context",
        score: article.aiContextScore ?? 0,
        note: article.aiContextNote,
      };

    case "headline":
      return {
        metric: "headline",
        score: article.aiHeadlineScore ?? 0,
        note: article.aiHeadlineNote,
      };

    case "fact":
      return {
        metric: "fact",
        score: article.aiFactRatio ?? 0,
        highlights: article.aiFactHighlights ?? [],
      };

    case "vulnerable":
      return {
        metric: "vulnerable",
        score: article.aiVulnerableScore ?? 0,
        spans: article.aiVulnerableSpans ?? [],
      };

    default:
      return null;
  }
}

export default function ReviewPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  const [validation, setValidation] = useState<any>(
    (location.state as any)?.validation ?? null
  );

  const [article, setArticle] = useState<Article | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(true);

  const [politicalLeaning, setPoliticalLeaning] = useState<PoliticalLeaning | null>(null);
  const [politicalIntensity, setPoliticalIntensity] = useState(3);
  const [languageIntensity, setLanguageIntensity] = useState(3);
  const [sensationalism, setSensationalism] = useState(3);
  const [threat, setThreat] = useState(3);
  const [groupConflict, setGroupConflict] = useState(3);
  const [highlighted, setHighlighted] = useState("");
  const [integrityDecision, setIntegrityDecision] = useState<boolean | null>(null);
  const [integrityNote, setIntegrityNote] = useState("");
  const [skippedArticleIds, setSkippedArticleIds] = useState<string[]>([]);

  function computePoliticalValue(): number {
    if (!politicalLeaning || politicalLeaning === "neutral") return 0;
    const direction = politicalLeaning === "left" ? -1 : 1;
    return direction * politicalIntensity;
  }

  const loadNextFromQueue = useCallback(
    async (excludeId: string, overrideSkipped?: string[]) => {
      if (!user) return;
      try {
        setArticle(null);
        const queue = await getReviewQueue(user.id);
        if (!queue || queue.length === 0) {
          navigate("/reviewer", { replace: true });
          return;
        }
        const skippedToUse = overrideSkipped ?? skippedArticleIds;
        const excludedIds = new Set([...skippedToUse, excludeId]);
        const nextItem = queue.find(
          (item) => !excludedIds.has(String(item.article.id))
        );
        if (!nextItem) {
          navigate("/reviewer", { replace: true });
          return;
        }
        navigate(`/review/${nextItem.article.id}`, {
          replace: true,
          state: { validation: nextItem.validation },
        });
      } catch (err) {
        console.error(err);
        toast.error("Failed to load review queue");
      }
    },
    [navigate, skippedArticleIds, user]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    async function loadArticle() {
      setLoadingArticle(true);
      try {
        if (!articleId) {
          const queue = await getReviewQueue(user.id);
          if (!queue || queue.length === 0) {
            navigate("/reviewer", { replace: true });
            return;
          }
          const first = queue.find(
            (item) => !skippedArticleIds.includes(String(item.article.id))
          );
          if (!first) {
            navigate("/reviewer", { replace: true });
            return;
          }
          navigate(`/review/${first.article.id}`, {
            replace: true,
            state: { validation: first.validation },
          });
          return;
        }

        const fetched = await getArticleById(articleId);
        if (!fetched) {
          toast.error("Article not found");
          navigate("/reviewer", { replace: true });
          return;
        }

        setArticle(fetched);

        const derived = deriveValidation(fetched);
        console.debug("[ReviewPage] rotatedMetric:", fetched.rotatedMetric, "→ validation:", derived);
        setValidation(derived);

        setPoliticalLeaning(null);
        setPoliticalIntensity(3);
        setLanguageIntensity(3);
        setSensationalism(3);
        setThreat(3);
        setGroupConflict(3);
        setHighlighted("");
        setIntegrityDecision(null);
        setIntegrityNote("");
      } catch (err) {
        console.error(err);
        toast.error("Failed to load article");
      } finally {
        setLoadingArticle(false);
        setSkipping(false);
      }
    }

    loadArticle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, user, loading, navigate]);

  async function handleSubmit() {
    if (!article || !user) return;
    if (!politicalLeaning) {
      toast.error("Select political direction before submitting");
      return;
    }
    if (validation && integrityDecision === null) {
      toast.error("Please respond to the AI integrity check");
      return;
    }
    setSubmitting(true);
    try {
      await submitReview({
        article_id: article.id,
        reviewer_id: user.id,
        political: computePoliticalValue(),
        intensity: languageIntensity,
        sensational: sensationalism,
        threat: threat,
        group_conflict: groupConflict,
        highlight: highlighted || null,
        metric: validation?.metric,
        agreed: integrityDecision,
        note: integrityNote,
      });
      toast.success("Review submitted");
      await loadNextFromQueue(article.id);
    } catch (err) {
      console.error(err);
      toast.error("Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!article || skipping) return;
    setSkipping(true);
    toast.info("Article skipped");
    const newSkipped = [...skippedArticleIds, String(article.id)];
    setSkippedArticleIds(newSkipped);
    await loadNextFromQueue(article.id, newSkipped);
  }

  const isBusy = skipping || submitting;

  if (loading || loadingArticle || !article) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading article...
      </div>
    );
  }

  function SliderField({
    label,
    value,
    onChange,
    disabled,
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    disabled?: boolean;
  }) {
    return (
      <div>
        <div className="mb-1 flex justify-between">
          <label className="text-xs text-muted-foreground">{label}</label>
          <span className="text-xs font-semibold">{value}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          disabled={disabled}
          className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <button
        onClick={() => navigate("/reviewer")}
        disabled={isBusy}
        className="flex items-center gap-1 text-sm text-muted-foreground disabled:opacity-40"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className={`grid gap-6 lg:grid-cols-2 transition-opacity duration-150 ${isBusy ? "pointer-events-none opacity-40" : ""}`}>
        <div className="space-y-4">
          <div className="rounded-lg border p-5">
            <h2 className="font-semibold">{article.headline}</h2>
            <p className="text-xs text-muted-foreground">{article.publisher}</p>
            <div className="mt-3 max-h-[400px] overflow-y-auto whitespace-pre-line text-sm">
              {article.content}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border p-5">
            <SpectrumBar value={article.politicalLeaning} />
            <HeatBar value={article.emotionalIntensity} label="Intensity" />
            <HeatBar value={article.tribalActivation} label="Us vs Them" />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-5">
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Political Direction</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "left", label: "Left" },
                  { key: "neutral", label: "Neutral" },
                  { key: "right", label: "Right" },
                ] as const).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setPoliticalLeaning(option.key)}
                    disabled={isBusy}
                    className={`rounded border py-2 text-sm transition-colors ${
                      politicalLeaning === option.key ? "bg-primary text-white" : "bg-background"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {!politicalLeaning && (
                <p className="text-xs text-muted-foreground">Please select a political direction.</p>
              )}
            </div>

            {politicalLeaning && politicalLeaning !== "neutral" && (
              <div>
                <div className="mb-1 flex justify-between">
                  <label className="text-xs text-muted-foreground">
                    {politicalLeaning === "left" ? "Left" : "Right"} Intensity
                  </label>
                  <span className="text-xs font-semibold">
                    {politicalLeaning === "left" ? "-" : "+"}{politicalIntensity}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={politicalIntensity}
                  onChange={(e) => setPoliticalIntensity(parseInt(e.target.value, 10))}
                  disabled={isBusy}
                  className="w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>Mild</span>
                  <span>Strong</span>
                </div>
              </div>
            )}

            {politicalLeaning && (
              <p className="text-xs text-muted-foreground">
                Stored value: <span className="font-semibold">{computePoliticalValue()}</span> (range: −5 to +5)
              </p>
            )}
          </div>

          <SliderField label="Language Intensity" value={languageIntensity} onChange={setLanguageIntensity} disabled={isBusy} />
          <SliderField label="Sensationalism" value={sensationalism} onChange={setSensationalism} disabled={isBusy} />
          <SliderField label="Threat Signal" value={threat} onChange={setThreat} disabled={isBusy} />
          <SliderField label="Group Conflict" value={groupConflict} onChange={setGroupConflict} disabled={isBusy} />

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Article Comment (Optional)</label>
            <textarea
              value={highlighted}
              onChange={(e) => setHighlighted(e.target.value)}
              placeholder="Leave any qualitative observations about this article..."
              className="w-full rounded border p-2 text-sm"
              disabled={isBusy}
            />
          </div>

          {validation && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/40">
              <p className="text-sm font-semibold">AI Integrity Check</p>
              {validation.note && (
                <p className="text-xs text-muted-foreground">{validation.note}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIntegrityDecision(true)}
                  disabled={isBusy}
                  className={`rounded border px-3 py-1 text-sm ${integrityDecision === true ? "bg-primary text-white" : ""}`}
                >
                  Agree
                </button>
                <button
                  type="button"
                  onClick={() => setIntegrityDecision(false)}
                  disabled={isBusy}
                  className={`rounded border px-3 py-1 text-sm ${integrityDecision === false ? "bg-destructive text-white" : ""}`}
                >
                  Disagree
                </button>
              </div>
              {integrityDecision === false && (
                <textarea
                  value={integrityNote}
                  onChange={(e) => setIntegrityNote(e.target.value)}
                  placeholder="Optional note"
                  className="w-full rounded border p-2 text-sm"
                />
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSkip}
              disabled={isBusy}
              className="flex flex-1 items-center justify-center gap-2 rounded border py-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SkipForward className="h-4 w-4" />
              {skipping ? "Skipping..." : "Skip Article"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isBusy || !politicalLeaning}
              className="flex flex-1 items-center justify-center gap-2 rounded bg-primary py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
