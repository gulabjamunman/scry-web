import { MetricCard } from '@/components/MetricCard';
import { Shield, Eye, Scale, FileText, Brain, AlertTriangle, BookOpen, Users, Layers } from 'lucide-react';

export default function TransparencyPage() {
  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transparency & Methodology</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How SCRY analyses and scores Indian news media
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Analysis Model"
          value="Haiku 4.5"
          icon={<Shield className="h-4 w-4" />}
          subtitle="Claude by Anthropic"
        />
        <MetricCard
          title="Publishers Tracked"
          value="13"
          icon={<FileText className="h-4 w-4" />}
          subtitle="Across the political spectrum"
        />
        <MetricCard
          title="Human Reviews"
          value="150+"
          icon={<Users className="h-4 w-4" />}
          subtitle="Calibration in progress"
        />
        <MetricCard
          title="Ingestion Schedule"
          value="Tiered"
          icon={<Scale className="h-4 w-4" />}
          subtitle="Every 10min–2hrs by source type"
        />
      </div>

      {/* Intro note */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900 leading-relaxed">
        SCRY uses a three-pipeline architecture: a <strong>Framing Analysis</strong> pipeline that
        measures political direction, emotional charge, and behavioural influence patterns; an{' '}
        <strong>Integrity Analysis</strong> pipeline that evaluates epistemic quality independently
        of ideology; and a <strong>Story Clustering</strong> pipeline that groups articles from
        different outlets covering the same event, enabling silence detection. All three pipelines
        are described below. Where limitations exist, we document them honestly.
      </div>

      <div className="space-y-5">

        {/* Pipeline 1 header */}
        <h2 className="text-base font-semibold text-foreground pt-2">
          Pipeline 1 — Framing & Behavioural Analysis
        </h2>

        {/* Model */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">LLM: Claude Haiku 4.5</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            All framing, integrity, and behavioural scores are produced in a single merged prompt
            per article by Claude Haiku 4.5 (Anthropic). The model receives the full article text
            and headline, and returns a structured JSON object covering both the framing and
            integrity dimensions in one pass. This design minimises API cost while keeping all
            scores contextually coherent with each other.
          </p>
        </section>

        {/* Ingestion */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Tiered Scraping Architecture</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sources are grouped into four tiers based on publication frequency and editorial
            significance. Each tier runs on its own cron schedule and has its own daily ingestion
            cap per publisher, keeping the corpus balanced and preventing high-volume outlets from
            dominating the dataset.
          </p>
          <div className="mt-3 rounded-lg border bg-muted/30 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-semibold text-foreground">Tier</th>
                  <th className="text-left px-4 py-2 font-semibold text-foreground">Run frequency</th>
                  <th className="text-left px-4 py-2 font-semibold text-foreground">Daily cap per publisher</th>
                  <th className="text-left px-4 py-2 font-semibold text-foreground">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { tier: "Breaking", freq: "Every 20 min", cap: "8 articles", purpose: "High-frequency news outlets" },
                  { tier: "Core",     freq: "Every 45 min", cap: "4 articles", purpose: "Major national dailies" },
                  { tier: "Independent", freq: "Every 2 hrs", cap: "3 articles", purpose: "Long-form and independent outlets" },
                  { tier: "Custom",   freq: "Every 2 hrs", cap: "3 articles", purpose: "Specialist or niche sources" },
                ].map(r => (
                  <tr key={r.tier} className="text-muted-foreground">
                    <td className="px-4 py-2 font-medium text-foreground">{r.tier}</td>
                    <td className="px-4 py-2">{r.freq}</td>
                    <td className="px-4 py-2">{r.cap}</td>
                    <td className="px-4 py-2">{r.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed pt-1">
            Articles appearing earlier in a publisher's RSS feed are more likely to be ingested
            within a given run, which introduces a mild recency bias within each outlet's daily
            output. The daily caps are an operational budget constraint, not a statistically
            designed sampling strategy.
          </p>
        </section>

        {/* Political Framing */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Political Framing Direction</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Scored on a continuous scale from −1 (strongly left-framed) to +1 (strongly
            right-framed). This score measures how the article frames political reality, not
            whether its claims are factually correct. Right-leaning framing includes nationalism,
            security narratives, and defence of conservative positions. Left-leaning framing
            includes social justice, minority rights, structural inequality, and criticism of
            nationalist politics.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An important design note: the score reflects the direction of the content being
            presented, not the inferred editorial stance of the publication. A neutral report
            quoting a nationalist speech will score right-leaning even if the outlet's editorial
            line is centrist. This is a deliberate methodological choice consistent with
            content-level framing analysis.
          </p>
        </section>

        {/* Emotional Intensity */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Language Intensity & Emotional Signals</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>Language intensity (0–1)</strong> is assessed by the LLM as part of the
            framing pass. 0 is calm and factual. 1 is highly emotional or charged. This is
            directionally independent — a neutral article can have high intensity (disaster
            reporting), and a strongly framed article can have low intensity (dry policy analysis).
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>BWS emotional intensity</strong> is computed using the NRC Emotion Intensity
            Lexicon (Mohammad & Bravo-Marquez, 2017), which provides word-level intensity scores
            derived via Best-Worst Scaling annotation. Each article's intensity is calculated from
            the proportion of emotionally weighted words across its full text. This runs entirely
            locally at no API cost.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>Emotion profile</strong> uses NRC EmoLex (English) or Hindi-NRC-EmoLex (Hindi)
            to measure the proportional presence of anger, fear, trust, joy, and disgust across
            the article. Language selection is automatic — Devanagari character detection routes
            to the Hindi lexicon.
          </p>
        </section>

        {/* Threat Signal */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Threat Signal Score</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A derived score combining the anger, fear, and disgust components of the emotion
            profile into a single threat salience measure (0–1). The weighting reflects
            political communication research showing anger as the primary driver of perceived
            threat in news framing (Nabi, 2003), with fear amplifying threat salience and disgust
            indexing moral outrage framing. Higher scores indicate content more likely to activate
            a threat response in readers.
          </p>
        </section>

        {/* Tribal Activation */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Tribal Activation (Us vs Them)</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Measures how strongly an article activates in-group and out-group dynamics (0–1).
            Derived from a weighted combination of framing direction strength, language intensity,
            and threat signal. An article scores high when it is simultaneously strongly framed,
            emotionally charged, and threatening — the combination most associated with identity
            mobilisation in political communication research.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The component weights are currently provisional and have not yet been empirically
            calibrated against human judgement. They are flagged for revision as the human review
            dataset grows.
          </p>
        </section>

        {/* Composite Ideology */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Composite Ideology Score</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A single −1 to +1 score that combines framing direction with its amplifying signals.
            Framing direction provides the sign and orientation. Language intensity, threat signal,
            and BWS emotional intensity amplify the magnitude — so a strongly framed, highly
            charged, threatening article scores much further from zero than a mildly framed,
            calm one expressing the same political direction.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Component weights are provisional pending empirical calibration against the growing
            human review dataset.
          </p>
        </section>

        {/* Sensationalism */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Sensationalism</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Scores the degree of dramatic, exaggerated, or alarmist presentation on a 0 to 1
            scale. Assessed by the LLM in the same analytical pass as framing direction, making
            it tightly coupled to the framing context of the article.
          </p>
        </section>

        {/* Behavioural Analysis */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Behavioural Influence Analysis</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A qualitative structured analysis of the psychological influence patterns present in
            each article, covering five dimensions: attention and salience mechanisms, emotional
            trigger identification, social and identity cue activation, motivation and action
            signals, and an overall behavioural interpretation. Visible in the article detail view.
          </p>
        </section>

        {/* Pipeline 2 header */}
        <h2 className="text-base font-semibold text-foreground pt-4">
          Pipeline 2 — Integrity Analysis
        </h2>

        {/* Integrity overview */}
        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Integrity analysis runs as part of the same LLM pass as framing, but evaluates a
            completely independent set of dimensions. It is designed to be skeptical of official
            claims and institutional announcements unless the article provides verifiable evidence
            or independent sourcing. Framing and integrity scores are intentionally decoupled —
            a right-leaning article can score high on integrity, and a left-leaning one can score low.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Contextual Accuracy</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Does the article provide the background, historical data, and comparative context
                needed to interpret its claims? Low scores indicate missing evidence or announcements
                presented without track record.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Headline Alignment</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Does the headline accurately represent what the article body actually says? Low
                scores indicate exaggerated scale, implied certainty, or conclusions the article
                does not reach.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Fact vs. Opinion Ratio</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                What proportion of the article consists of verifiable facts versus official claims,
                aspirational language, and rhetorical framing? Official claims without evidence do
                not count as factual.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Vulnerable Group Risk</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Does the article risk harm to individuals or communities through identification of
                victims, stigma reinforcement, or language that could increase hostility toward
                marginalised groups?
              </p>
            </div>
          </div>
        </section>

        {/* Pipeline 3 */}
        <h2 className="text-base font-semibold text-foreground pt-4">
          Pipeline 3 — Story Clustering & Silence Detection
        </h2>

        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Semantic Clustering</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Articles covering the same event are grouped using{' '}
            <code className="text-xs bg-muted px-1 rounded">paraphrase-multilingual-MiniLM-L12-v2</code>,
            a sentence transformer that handles English and Hindi natively. Each article is
            embedded from its headline and opening text, then compared against active cluster
            centroids using cosine similarity. Articles above a calibrated similarity threshold
            join an existing cluster; those below it seed a new one. Clusters that receive no
            new articles for an extended window are marked inactive.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong>Silence detection:</strong> for each story cluster, the system records which
            of the 13 tracked publishers covered and did not cover the story. An outlet's absence
            from a cluster that multiple others covered is a measurable editorial signal.
          </p>
        </section>

        {/* Human Review */}
        <h2 className="text-base font-semibold text-foreground pt-4">
          Human Calibration
        </h2>

        <section className="rounded-lg border bg-card p-6 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-card-foreground">Human Review Process</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Registered reviewers score articles independently across five dimensions using the
            same scale as the AI pipeline. Their scores are compared to AI-generated scores to
            detect systematic divergence. Each article is also assigned one integrity dimension
            as its primary human validation target, distributing review effort evenly across
            all four integrity metrics.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We currently have approximately 150 human reviews, which provides an initial
            calibration signal. Meaningful inter-rater reliability statistics require several
            thousand paired observations per metric. We are actively building toward this
            through academic partnerships and a structured reviewer program.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Weights in derived scores are explicitly provisional until empirical calibration
            against human review data is complete. This is documented honestly because we
            believe methodological transparency is more valuable than false precision.
          </p>
        </section>

        {/* Limitations */}
        <section className="rounded-lg border border-amber-100 bg-amber-50 p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-amber-900">Known Limitations</h3>
          <ul className="space-y-2 text-sm text-amber-800 leading-relaxed list-disc list-inside">
            <li>
              Framing scores are model point estimates with no confidence interval. Two runs of
              the same article may produce slightly different scores due to LLM temperature
              sampling.
            </li>
            <li>
              The ideological spectrum in the prompt reflects a particular political theory. What
              constitutes left-leaning or right-leaning framing in Indian political discourse is
              contestable and embedded in the prompt design.
            </li>
            <li>
              Weights in derived scores are theoretically motivated priors, not empirically
              derived from this corpus. They are flagged for revision as the human review
              dataset grows.
            </li>
            <li>
              The LLM has no specific calibration for Indian political discourse. Terms carrying
              particular valence in Indian politics may not be consistently weighted by a model
              trained predominantly on Western English-language content.
            </li>
            <li>
              Hindi language support is partial. The BWS emotional intensity lexicon is
              English-only, meaning intensity scores for Hindi articles may be underestimated.
              NRC EmoLex Hindi coverage is sparser than the English version.
            </li>
            <li>
              Daily ingestion caps are an operational budget constraint, not a sampling strategy.
              Articles appearing earlier in a publisher's RSS feed are more likely to be ingested,
              introducing a recency bias within each outlet's daily output.
            </li>
            <li>
              Story clustering has not been validated against a human-labelled ground truth. The
              similarity threshold may produce false positives or false negatives for specific
              topic areas.
            </li>
            <li>
              Sentiment labels (Positive / Negative / Neutral) are inferred from framing direction
              and intensity, not from direct sentiment analysis. The inference assumptions may not
              hold for all content types.
            </li>
          </ul>
        </section>

      </div>
    </div>
  );
}
