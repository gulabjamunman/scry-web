import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHomepageShowcase } from "@/lib/api";

type ShowcaseArticle = {
  id: string;
  headline: string;
  ai_score: number;
  avg_human_score: number;
  divergence: number;
};

type ShowcaseResponse = {
  high_divergence: ShowcaseArticle[];
  high_agreement: ShowcaseArticle | null;
};

export default function LandingPage() {

  const [showcase, setShowcase] = useState<ShowcaseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadShowcase() {
      try {
        const data = await getHomepageShowcase();
        setShowcase(data);
      } catch (err) {
        console.error("Failed to load showcase:", err);
      } finally {
        setLoading(false);
      }
    }

    loadShowcase();
  }, []);

  return (
    <div className="space-y-16 p-8">

      {/* HERO */}
      <section className="text-center space-y-4">

        <h1 className="text-4xl font-bold tracking-tight">
          See How News Is Judged
        </h1>

        <p className="text-muted-foreground max-w-2xl mx-auto">
          SCRY compares AI integrity scoring with structured human review.
          Not to declare truth, but to measure how judgment happens.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          <Link
            to="/observatory"
            className="px-6 py-2 rounded bg-primary text-white"
          >
            Enter Observatory
          </Link>

          <Link
            to="/login"
            className="px-6 py-2 rounded border"
          >
            Become a Reviewer
          </Link>
        </div>

      </section>


      {/* DIVERGENCE SECTION */}
      {!loading && showcase && showcase.high_divergence && (
        <section className="space-y-6">

          <h2 className="text-2xl font-semibold text-center">
            Where AI and Humans Disagree
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            {showcase.high_divergence.map(article => (
              <div
                key={article.id}
                className="p-6 border rounded-lg bg-card"
              >
                <h3 className="font-medium mb-4">
                  {article.headline}
                </h3>

                <div className="space-y-2 text-sm">
                  <div>AI Score: {article.ai_score}</div>
                  <div>Human Score: {article.avg_human_score}</div>
                  <div className="text-muted-foreground">
                    Difference: {article.divergence}
                  </div>
                </div>

                <Link
                  to={`/article/${article.id}`}
                  className="inline-block mt-4 text-primary hover:underline"
                >
                  View Full Analysis →
                </Link>
              </div>
            ))}
          </div>

          {showcase.high_agreement && (
            <div className="max-w-xl mx-auto mt-12 p-6 border rounded-lg bg-card">

              <h3 className="font-medium mb-4 text-center">
                Strong AI–Human Alignment
              </h3>

              <div className="text-sm space-y-2 text-center">
                <div>{showcase.high_agreement.headline}</div>
                <div>
                  AI: {showcase.high_agreement.ai_score} | Human: {showcase.high_agreement.avg_human_score}
                </div>
              </div>

              <div className="text-center mt-4">
                <Link
                  to={`/article/${showcase.high_agreement.id}`}
                  className="text-primary hover:underline"
                >
                  View Full Analysis →
                </Link>
              </div>

            </div>
          )}

        </section>
      )}


      {/* CTA TO OBSERVATORY */}
      <section className="text-center pt-12 border-t">

        <h2 className="text-xl font-semibold mb-4">
          Explore the SCRY Observatory
        </h2>

        <Link
          to="/observatory"
          className="px-6 py-2 rounded border"
        >
          View Live Metrics
        </Link>

      </section>

    </div>
  );
}
