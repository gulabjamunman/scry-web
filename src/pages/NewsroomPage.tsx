import { useNavigate } from "react-router-dom"
import {
  Building2, Telescope, Radio, FileText,
  Users, ChevronRight, Crown, Shield,
  BookOpen, Eye, BarChart3,
} from "lucide-react"
import { useNewsroomContext, type OrgRole } from "@/hooks/useNewsroomContext"
import { useAuth } from "@/lib/auth"

// ─────────────────────────────────────────────────────────────────────────────
// Role badge
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_META: Record<OrgRole, { label: string; icon: typeof Crown; color: string }> = {
  owner:      { label: "Owner",      icon: Crown,    color: "text-amber-500"  },
  editor:     { label: "Editor",     icon: Shield,   color: "text-blue-500"   },
  journalist: { label: "Journalist", icon: BookOpen, color: "text-green-500"  },
  analyst:    { label: "Analyst",    icon: BarChart3,color: "text-purple-500" },
  viewer:     { label: "Viewer",     icon: Eye,      color: "text-slate-400"  },
}

function RoleBadge({ role }: { role: OrgRole }) {
  const meta = ROLE_META[role] ?? ROLE_META.viewer
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature card
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureCardProps {
  icon:        React.ElementType
  title:       string
  description: string
  href:        string
  tag?:        string
}

function FeatureCard({ icon: Icon, title, description, href, tag }: FeatureCardProps) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(href)}
      className="group text-left w-full rounded-xl border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/8 p-2.5 group-hover:bg-primary/12 transition-colors">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              {tag && (
                <span className="text-[10px] font-mono tracking-wider text-muted-foreground border rounded px-1.5 py-0.5 uppercase">
                  {tag}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-primary/60 transition-colors" />
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Publisher pill
// ─────────────────────────────────────────────────────────────────────────────

function PublisherPill({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
      {name}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function NewsroomPage() {
  const { user }                               = useAuth()
  const { membership, orgPublishers, isOwner } = useNewsroomContext()

  const org  = membership?.org
  const role = membership?.role ?? "viewer"

  const features: FeatureCardProps[] = [
    {
      icon:        Telescope,
      title:       "Intelligence Observatory",
      description: "Track story clusters across all publishers. See how narratives form, propagate, and diverge — with your org's coverage highlighted.",
      href:        "/newsroom/observatory",
    },
    {
      icon:        Radio,
      title:       "Signals Observatory",
      description: "Velocity spikes and editorial silences in real time. Surface what's breaking and what's being ignored before it becomes a story.",
      href:        "/newsroom/signals",
    },
    {
      icon:        FileText,
      title:       "Draft Analyzer",
      description: "Paste a draft before publishing. Get framing scores, ecosystem comparison, journalist profile, and SEO/AEO readiness checks.",
      href:        "/newsroom/draft",
    },
    {
      icon:        Users,
      title:       "Journalist Intelligence",
      description: "Writing signatures, framing patterns, and topic focus for every byline in the system. Compare journalists within and across publications.",
      href:        "/newsroom/journalists",
    },
  ]

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">

      {/* ── Identity card ───────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-6 space-y-4">

        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <Building2 className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                {org?.name ?? "Your Newsroom"}
              </h1>
              <p className="text-xs text-muted-foreground capitalize">
                {org?.type ?? "Organisation"} · {org?.plan ?? "—"} plan
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <RoleBadge role={role} />
            {isOwner && (
              <span className="text-[10px] text-muted-foreground">
                Full access
              </span>
            )}
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-2 pt-1 border-t">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-primary uppercase">
              {user?.email?.[0] ?? "?"}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-foreground truncate">{user?.email}</p>
            {membership?.byline_name && (
              <p className="text-[10px] text-muted-foreground">
                Byline: {membership.byline_name}
                {membership.desk ? ` · ${membership.desk} desk` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Publisher scope */}
        {orgPublishers.length > 0 && (
          <div className="space-y-2 pt-1 border-t">
            <p className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
              Tracked publishers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orgPublishers.map(p => <PublisherPill key={p} name={p} />)}
            </div>
          </div>
        )}

      </div>

      {/* ── Section label ───────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase mb-4">
          Intelligence Suite
        </p>

        {/* ── Feature cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map(f => <FeatureCard key={f.href} {...f} />)}
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground border-t pt-6">
        All intelligence features show the full ecosystem. Your organisation's publishers
        are <span className="text-foreground font-medium">highlighted</span> throughout for quick reference.
        {isOwner && (
          <> Manage seats and billing from the{" "}
            <a href="/admin" className="text-primary hover:underline">admin dashboard</a>.
          </>
        )}
      </p>

    </div>
  )
}
