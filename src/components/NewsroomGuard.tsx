import { type ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Loader, Building2, ArrowRight, Lock } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { useNewsroomContext, type NewsroomFeatureAccess } from "@/hooks/useNewsroomContext"

const ROUTE_FEATURE_MAP: Record<string, keyof NewsroomFeatureAccess> = {
  "/newsroom/observatory": "observatory",
  "/newsroom/signals":     "signals",
  "/newsroom/draft":       "draft",
  "/newsroom/journalists": "journalists",
}

function featureLabel(key: keyof NewsroomFeatureAccess): string {
  return {
    observatory: "Intelligence Observatory",
    signals:     "Signals Observatory",
    draft:       "Draft Analyzer",
    journalists: "Journalist Intelligence",
  }[key]
}

export default function NewsroomGuard({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const ctx      = useNewsroomContext()

  if (authLoading || ctx.loading) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || ctx.error === "unauthenticated") {
    return <Navigate to="/login" replace state={{ redirectTo: location.pathname }} />
  }

  if (ctx.error === "no_org" || !ctx.membership) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 flex flex-col items-start gap-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <span className="text-xs font-mono tracking-widest text-primary uppercase">Newsroom Intelligence</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">No organisation linked to your account.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Newsroom Intelligence is available to verified media organisations. Ask your organisation's
            owner to add you as a member, or contact us to get your newsroom onboarded.
          </p>
        </div>
        <a href="mailto:hello@scry.in" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition">
          Contact us <ArrowRight className="h-3.5 w-3.5" />
        </a>
        <p className="text-xs text-muted-foreground">
          You can still use the{" "}
          <a href="/explorer" className="text-primary hover:underline">Article Explorer</a> and{" "}
          <a href="/insights" className="text-primary hover:underline">Insights</a>.
        </p>
      </div>
    )
  }

  if (!ctx.hasAccess) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 flex flex-col items-start gap-6">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-destructive" />
          <span className="text-xs font-mono tracking-widest text-destructive uppercase">Access Suspended</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Your access has been suspended.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your account or organisation is currently inactive. Contact your organisation owner or reach
            us at <a href="mailto:hello@scry.in" className="text-primary hover:underline">hello@scry.in</a>.
          </p>
        </div>
      </div>
    )
  }

  // Feature-level gate for non-hub routes
  const featureKey = ROUTE_FEATURE_MAP[location.pathname]
  if (featureKey && !ctx.features[featureKey]) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 flex flex-col items-start gap-6">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-mono tracking-widest text-muted-foreground uppercase">Feature not enabled</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{featureLabel(featureKey)} isn't on your plan.</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your organisation's current plan doesn't include {featureLabel(featureKey)}.
            Ask your owner to upgrade, or contact us to enable it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/newsroom" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition">
            Back to Newsroom
          </a>
          <a href="mailto:hello@scry.in" className="text-sm text-muted-foreground hover:text-foreground transition">
            Contact us →
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
