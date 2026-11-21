import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/lib/auth"

export type OrgRole = "owner" | "editor" | "journalist" | "analyst" | "viewer"

export interface NewsroomOrg {
  id:              string
  name:            string
  slug:            string
  type:            string
  plan:            string
  trial_ends_at:   string | null
  plan_expires_at: string | null
  is_active:       boolean
  max_seats:       number
  features: {
    cluster_intelligence: boolean
    signals_dashboard:    boolean
    draft_analysis:       boolean
    journalist_profiles:  boolean
    org_profile:          boolean
    seo_analysis:         boolean
    bulk_export:          boolean
    api_access:           boolean
    white_label:          boolean
  }
}

export interface NewsroomMembership {
  org:         NewsroomOrg
  role:        OrgRole
  byline_name: string | null
  desk:        string | null
  is_active:   boolean
}

/**
 * Per-feature access flags derived from org.features + membership.is_active.
 * All false if the member row is inactive, regardless of org features.
 */
export interface NewsroomFeatureAccess {
  observatory: boolean  // cluster_intelligence
  signals:     boolean  // signals_dashboard
  draft:       boolean  // draft_analysis
  journalists: boolean  // journalist_profiles
}

export interface NewsroomContextData {
  membership:    NewsroomMembership | null
  orgPublishers: string[]             // scraper_sources.name values for this org
  features:      NewsroomFeatureAccess
  hasAccess:     boolean              // org.is_active AND org_members.is_active
  isOwner:       boolean
  loading:       boolean
  error:         "unauthenticated" | "no_org" | "unknown" | null
}

const NO_FEATURES: NewsroomFeatureAccess = {
  observatory: false,
  signals:     false,
  draft:       false,
  journalists: false,
}

/**
 * Fetches org membership, role, feature flags, and publisher names for the
 * current user.
 *
 * Publisher matching:
 *   scraper_sources.slug === org.slug  (primary)
 *   OR scraper_sources.name ILIKE org.name  (fallback)
 *
 * Access rule:
 *   hasAccess = org.is_active AND org_members.is_active
 *
 * Feature access:
 *   Owners bypass feature flags — always get full access.
 *   Other roles are scoped to org.features JSONB.
 *
 * Seat gating (future):
 *   Add seat_granted boolean to org_members, then AND it in here for non-owners.
 */
export function useNewsroomContext(): NewsroomContextData {
  const { user, loading: authLoading } = useAuth()

  const [state, setState] = useState<NewsroomContextData>({
    membership:    null,
    orgPublishers: [],
    features:      NO_FEATURES,
    hasAccess:     false,
    isOwner:       false,
    loading:       true,
    error:         null,
  })

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setState(s => ({ ...s, loading: false, error: "unauthenticated" }))
      return
    }

    let cancelled = false

    async function load() {
      try {
        // 1. Fetch membership + org in one query
        //    Existing RLS policy "Org members see org roster" scopes this correctly
        const { data: memberRow, error: memberErr } = await supabase
          .from("org_members")
          .select(`
            role,
            byline_name,
            desk,
            is_active,
            organisations (
              id, name, slug, type, plan,
              trial_ends_at, plan_expires_at, is_active,
              max_seats, features
            )
          `)
          .eq("user_id", user!.id)
          .eq("is_active", true)
          .maybeSingle()

        if (memberErr) throw memberErr

        if (!memberRow || !memberRow.organisations) {
          if (!cancelled) setState(s => ({ ...s, loading: false, error: "no_org" }))
          return
        }

        const org  = memberRow.organisations as unknown as NewsroomOrg
        const role = memberRow.role as OrgRole

        const membership: NewsroomMembership = {
          org,
          role,
          byline_name: memberRow.byline_name ?? null,
          desk:        memberRow.desk        ?? null,
          is_active:   memberRow.is_active   ?? true,
        }

        // 2. Resolve publisher names via scraper_sources
        //    Uses scraper_sources.name (not publisher_name — doesn't exist in schema)
        const { data: sources } = await supabase
          .from("scraper_sources")
          .select("name, slug")
          .or(`slug.eq.${org.slug},name.ilike.%${org.name}%`)
          .eq("is_active", true)

        const orgPublishers: string[] = sources
          ? [...new Set(sources.map((s: any) => s.name as string))]
          : []

        // 3. Access
        const hasAccess = org.is_active && (memberRow.is_active ?? true)
        const isOwner   = role === "owner"

        // 4. Feature flags — owners bypass, others respect org.features
        const f = org.features ?? {}
        const features: NewsroomFeatureAccess = isOwner
          ? { observatory: true, signals: true, draft: true, journalists: true }
          : {
              observatory: f.cluster_intelligence ?? false,
              signals:     f.signals_dashboard    ?? false,
              draft:       f.draft_analysis       ?? false,
              journalists: f.journalist_profiles  ?? false,
            }

        if (!cancelled) {
          setState({ membership, orgPublishers, features, hasAccess, isOwner, loading: false, error: null })
        }
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: "unknown" }))
      }
    }

    load()
    return () => { cancelled = true }
  }, [user, authLoading])

  return state
}
