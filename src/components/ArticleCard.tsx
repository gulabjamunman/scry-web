import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SpectrumBar } from './SpectrumBar';
import { HeatBar } from './HeatBar';
import { WarningIndicator } from './WarningIndicator';
import type { Article } from '@/lib/types';
import { Calendar, Building2, CheckCircle2, Clock, ShieldCheck } from 'lucide-react';

interface ArticleCardProps {
  article: Article;
  className?: string;
}

export function ArticleCard({ article, className }: ArticleCardProps) {
  const hasIntegrity = article.aiContextScore != null
  const isProcessed  = article.processed

  return (
    <Link
      to={`/article/${article.id}`}
      className={cn(
        "group block rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20",
        className
      )}
    >
      {/* Header row — headline + status badge */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-card-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
          {article.headline}
        </h3>

        {/* Status badge */}
        <div className="flex-shrink-0 mt-0.5">
          {!isProcessed ? (
            <span
              title="Pending analysis"
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-400"
            >
              <Clock className="h-3 w-3" />
              Pending
            </span>
          ) : hasIntegrity ? (
            <span
              title="Fully analyzed — bias + integrity"
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600"
            >
              <ShieldCheck className="h-3 w-3" />
              Full
            </span>
          ) : (
            <span
              title="Bias analyzed — integrity pending"
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-600"
            >
              <CheckCircle2 className="h-3 w-3" />
              Analyzed
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Building2 className="h-3 w-3" />
          {article.publisher}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {new Date(article.date).toLocaleDateString()}
        </span>
        {article.reviewCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {article.reviewCount} {article.reviewCount === 1 ? "review" : "reviews"}
          </span>
        )}
      </div>

      {/* Scores — only show if processed */}
      {isProcessed ? (
        <div className="mt-4 space-y-3">
          <SpectrumBar value={article.politicalLeaning} height="sm" />
          <HeatBar value={article.emotionalIntensity} label="Emotional Intensity" />
          <WarningIndicator
            level={article.tribalActivation}
            label={`Tribal Activation: ${Math.round(article.tribalActivation * 100)}%`}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-md bg-neutral-50 border border-neutral-100 px-3 py-2.5 text-xs text-neutral-400 text-center">
          Analysis in progress
        </div>
      )}
    </Link>
  );
}
