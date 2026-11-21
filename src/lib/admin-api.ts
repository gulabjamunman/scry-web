// ============================================================
// src/lib/admin-api.ts
//
// All Supabase calls for the admin dashboard.
// Every function here requires platform_role = 'admin'.
// Import and use only from AdminPage and its children.
// ============================================================

import { adminSupabase as supabase, isAdminAuthenticated } from "./admin-auth"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OrgPlan = "trial" | "newsroom" | "agency" | "institution" | "custom"
export type OrgType = "publication" | "agency" | "institution" | "independent"

export type Organisation = {
  id:                   string
  name:                 string
  slug:                 string
  type:                 OrgType
  primary_email:        string | null
  billing_email:        string | null
  website:              string | null
  plan:                 OrgPlan
  plan_started_at:      string | null
  plan_expires_at:      string | null
  trial_ends_at:        string | null
  is_active:            boolean
  features:             Record<string, boolean>
  max_seats:            number
  max_articles_per_day: number
  has_own_feed:         boolean
  notes:                string | null
  created_at:           string
  member_count?:        number
}

export type PlatformUser = {
  id:             string
  full_name:      string | null
  display_name:   string | null
  platform_role:  string
  is_active:      boolean
  is_verified:    boolean
  approved_at:    string | null
  created_at:     string
  last_seen_at:   string | null
  email?:         string
  org_memberships?: OrgMembership[]
}

export type OrgMembership = {
  id:          string
  org_id:      string
  user_id:     string
  role:        string
  byline_name: string | null
  desk:        string | null
  is_active:   boolean
  accepted_at: string | null
  org_name?:   string
}

export type ScraperSource = {
  id:                    string
  name:                  string
  slug:                  string | null
  url:                   string
  feed_url:              string | null
  feed_type:             string
  tier:                  string
  scrape_interval_minutes: number | null
  is_active:             boolean
  last_scraped_at:       string | null
  last_error:            string | null
  error_count:           number
  consecutive_failures:  number
  articles_today:        number
  articles_total:        number
  language:              string
}

export type PipelineHeartbeat = {
  job_name:           string
  last_run:           string
  articles_processed: number
  articles_failed:    number
  duration_seconds:   number | null
  status:             string
  error_message:      string | null
}

export type AdminStats = {
  total_orgs:       number
  active_orgs:      number
  trial_orgs:       number
  total_users:      number
  pending_users:    number
  total_articles:   number
  articles_today:   number
  active_sources:   number
}

export type FeatureFlag = {
  key:           string
  label:         string
  description:   string | null
  default_value: boolean
  available_on:  string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard — call at top of every admin page
// ─────────────────────────────────────────────────────────────────────────────

export async function assertAdmin(): Promise<boolean> {
  return isAdminAuthenticated()
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard stats
// ─────────────────────────────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  const [orgsRes, usersRes, articlesRes, todayRes, sourcesRes] = await Promise.all([
    supabase.from("organisations").select("id, is_active, plan"),
    supabase.from("users").select("id, is_active, approved_at"),
    supabase.from("articles").select("id", { count: "exact", head: true }),
    supabase.from("articles")
      .select("id", { count: "exact", head: true })
      .gte("scraped_at", new Date(Date.now() - 86400000).toISOString()),
    supabase.from("scraper_sources").select("id, is_active"),
  ])

  const orgs  = orgsRes.data  || []
  const users = usersRes.data || []

  return {
    total_orgs:     orgs.length,
    active_orgs:    orgs.filter(o => o.is_active).length,
    trial_orgs:     orgs.filter(o => o.plan === "trial").length,
    total_users:    users.length,
    pending_users:  users.filter(u => !u.approved_at).length,
    total_articles: articlesRes.count || 0,
    articles_today: todayRes.count    || 0,
    active_sources: (sourcesRes.data || []).filter(s => s.is_active).length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Organisations
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrganisations(): Promise<Organisation[]> {
  const { data, error } = await supabase
    .from("organisations")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) throw error

  // Get member counts separately
  const ids = (data || []).map(o => o.id)
  if (ids.length === 0) return []

  const { data: members } = await supabase
    .from("org_members")
    .select("org_id")
    .in("org_id", ids)
    .eq("is_active", true)

  const counts: Record<string, number> = {}
  ;(members || []).forEach(m => {
    counts[m.org_id] = (counts[m.org_id] || 0) + 1
  })

  return (data || []).map(row => ({
    ...row,
    member_count: counts[row.id] || 0,
  }))
}

export async function createOrganisation(input: {
  name:          string
  slug:          string
  type:          OrgType
  primary_email: string
  plan:          OrgPlan
  max_seats:     number
  notes?:        string
}): Promise<Organisation> {
  const { data: { user } } = await supabase.auth.getUser()

  // Set plan_started_at and trial_ends_at based on plan
  const now = new Date().toISOString()
  const trialEnd = new Date(Date.now() + 14 * 86400000).toISOString()

  const { data, error } = await supabase
    .from("organisations")
    .insert({
      name:           input.name,
      slug:           input.slug,
      type:           input.type,
      primary_email:  input.primary_email,
      plan:           input.plan,
      plan_started_at: now,
      trial_ends_at:  input.plan === "trial" ? trialEnd : null,
      max_seats:      input.max_seats,
      notes:          input.notes || null,
      created_by:     user?.id,
      is_active:      true,
    })
    .select()
    .single()

  if (error) throw error

  await logAudit("org_created", "organisation", data.id, null, data)
  return data
}

export async function updateOrgPlan(orgId: string, plan: OrgPlan): Promise<void> {
  const { data: before } = await supabase
    .from("organisations")
    .select("plan, plan_expires_at")
    .eq("id", orgId)
    .single()

  const { error } = await supabase
    .from("organisations")
    .update({
      plan,
      plan_started_at: new Date().toISOString(),
      // Set expiry 1 year out for paid plans
      plan_expires_at: plan !== "trial"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : null,
    })
    .eq("id", orgId)

  if (error) throw error
  await logAudit("plan_changed", "organisation", orgId, before, { plan })
}

export async function updateOrgFeature(
  orgId: string,
  featureKey: string,
  enabled: boolean
): Promise<void> {
  // Fetch current features
  const { data: org } = await supabase
    .from("organisations")
    .select("features")
    .eq("id", orgId)
    .single()

  const currentFeatures = org?.features || {}
  const updatedFeatures = { ...currentFeatures, [featureKey]: enabled }

  const { error } = await supabase
    .from("organisations")
    .update({ features: updatedFeatures })
    .eq("id", orgId)

  if (error) throw error
  await logAudit(
    "org_feature_toggled", "organisation", orgId,
    { [featureKey]: !enabled },
    { [featureKey]: enabled }
  )
}

export async function setOrgActive(orgId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("organisations")
    .update({ is_active: active })
    .eq("id", orgId)

  if (error) throw error
  await logAudit(
    active ? "org_activated" : "org_suspended",
    "organisation", orgId, null, { is_active: active }
  )
}

export async function updateOrgNotes(orgId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from("organisations")
    .update({ notes })
    .eq("id", orgId)
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

export async function getPlatformUsers(filter?: {
  role?: string
  pending?: boolean
}): Promise<PlatformUser[]> {
  let query = supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })

  if (filter?.role)    query = query.eq("platform_role", filter.role)
  if (filter?.pending) query = query.is("approved_at", null)

  const { data, error } = await query
  if (error) throw error
  if (!data || data.length === 0) return []

  // Fetch emails from auth.users via service-role RPC
  const emailMap: Record<string, string> = {}
  try {
    const { data: authEmails } = await supabase.rpc("get_auth_emails")
    if (authEmails) {
      authEmails.forEach((row: { id: string; email: string }) => {
        emailMap[row.id] = row.email
      })
    }
  } catch {
    // get_auth_emails RPC not available — emails will be empty
  }

  // Get org memberships
  const userIds = data.map(u => u.id)
  const { data: memberships } = await supabase
    .from("org_members")
    .select("*, organisations(name)")
    .in("user_id", userIds)

  const membersByUser: Record<string, OrgMembership[]> = {}
  ;(memberships || []).forEach((m: any) => {
    if (!membersByUser[m.user_id]) membersByUser[m.user_id] = []
    membersByUser[m.user_id].push({
      ...m,
      org_name: m.organisations?.name,
    })
  })

  return data.map(row => ({
    ...row,
    email:           emailMap[row.id] ?? null,
    org_memberships: membersByUser[row.id] || [],
  }))
}

export async function approveUser(userId: string): Promise<void> {
  const { data: { user: admin } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("users")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: admin?.id,
      is_active:   true,
    })
    .eq("id", userId)

  if (error) throw error
  await logAudit("user_approved", "user", userId, null, { approved: true })
}

export async function suspendUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ is_active: false })
    .eq("id", userId)

  if (error) throw error
  await logAudit("user_suspended", "user", userId, null, { is_active: false })
}

export async function setUserRole(userId: string, role: string): Promise<void> {
  const { data: before } = await supabase
    .from("users")
    .select("platform_role")
    .eq("id", userId)
    .single()

  const { error } = await supabase
    .from("users")
    .update({ platform_role: role })
    .eq("id", userId)

  if (error) throw error
  await logAudit("user_role_changed", "user", userId, before, { platform_role: role })
}

export async function addUserToOrg(input: {
  user_id: string
  org_id:  string
  role:    string
  byline_name?: string
  desk?:   string
}): Promise<void> {
  const { data: { user: admin } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("org_members")
    .upsert({
      user_id:     input.user_id,
      org_id:      input.org_id,
      role:        input.role,
      byline_name: input.byline_name || null,
      desk:        input.desk        || null,
      is_active:   true,
      invited_by:  admin?.id,
      accepted_at: new Date().toISOString(),
    }, { onConflict: "org_id,user_id" })

  if (error) throw error
}

export async function removeUserFromOrg(userId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("org_members")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("org_id", orgId)

  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// Scraper sources
// ─────────────────────────────────────────────────────────────────────────────

export async function getScraperSources(): Promise<ScraperSource[]> {
  const { data, error } = await supabase
    .from("scraper_sources")
    .select("*")
    .order("tier")
    .order("name")

  if (error) throw error
  return data || []
}

export async function toggleScraperSource(sourceId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("scraper_sources")
    .update({ is_active: active })
    .eq("id", sourceId)

  if (error) throw error
  await logAudit(
    active ? "source_activated" : "source_paused",
    "scraper_source", sourceId, null, { is_active: active }
  )
}

export async function updateScraperInterval(
  sourceId: string,
  minutes: number
): Promise<void> {
  const { error } = await supabase
    .from("scraper_sources")
    .update({ scrape_interval_minutes: minutes })
    .eq("id", sourceId)
  if (error) throw error
}

export async function resetScraperErrors(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from("scraper_sources")
    .update({ error_count: 0, consecutive_failures: 0, last_error: null })
    .eq("id", sourceId)
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline heartbeats
// ─────────────────────────────────────────────────────────────────────────────

export async function getPipelineHeartbeats(): Promise<PipelineHeartbeat[]> {
  const { data, error } = await supabase
    .from("pipeline_heartbeats")
    .select("*")
    .order("last_run", { ascending: false })

  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flags
// ─────────────────────────────────────────────────────────────────────────────

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("*")
    .order("key")

  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

async function logAudit(
  action:      string,
  targetType:  string,
  targetId:    string,
  before:      any,
  after:       any,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from("admin_audit_log").insert({
    admin_id:    user?.id,
    action,
    target_type: targetType,
    target_id:   targetId,
    before,
    after,
  })
  // Don't throw on audit failure — non-critical
}

export async function getAuditLog(limit = 50) {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

// ─────────────────────────────────────────────────────────────────────────────
// Org Members
// ─────────────────────────────────────────────────────────────────────────────

export type OrgMemberDetail = {
  id:          string
  user_id:     string
  org_id:      string
  role:        string
  byline_name: string | null
  desk:        string | null
  created_at:  string
  email?:      string
  full_name?:  string
}

export async function getOrgMembers(orgId: string): Promise<OrgMemberDetail[]> {
  const { data, error } = await supabase
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) return []

  // Fetch emails for these members
  const emailMap: Record<string, string> = {}
  const nameMap:  Record<string, string> = {}
  try {
    const { data: authEmails } = await supabase.rpc("get_auth_emails")
    if (authEmails) {
      authEmails.forEach((row: { id: string; email: string }) => {
        emailMap[row.id] = row.email
      })
    }
  } catch {}

  try {
    const userIds = data.map(m => m.user_id)
    const { data: users } = await supabase
      .from("users")
      .select("id, full_name, display_name")
      .in("id", userIds)
    if (users) {
      users.forEach((u: any) => {
        nameMap[u.id] = u.full_name || u.display_name || ""
      })
    }
  } catch {}

  return data.map(row => ({
    ...row,
    email:     emailMap[row.user_id] ?? undefined,
    full_name: nameMap[row.user_id]  ?? undefined,
  }))
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("id", memberId)
  if (error) throw error
  await logAudit("member_role_updated", "org_member", memberId, null, { role })
}

export async function updateMemberByline(memberId: string, bylineName: string): Promise<void> {
  const { error } = await supabase
    .from("org_members")
    .update({ byline_name: bylineName })
    .eq("id", memberId)
  if (error) throw error
}
