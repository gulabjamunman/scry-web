// ============================================================
// src/pages/AdminPage.tsx
//
// Protected admin control panel. Only accessible to users with
// platform_role = 'admin'. Redirects everyone else to /.
//
// Tabs:
//   1. Overview    — stats at a glance
//   2. Orgs        — register, configure, toggle features
//   3. Users       — approve, assign, manage
//   4. Permissions — manage Intelligence Observatory access
//   5. Pipeline    — scraper status, heartbeats, source toggles
//   6. Reports     — enable/generate/cache narrative briefs
// ============================================================

import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow, parseISO, format } from "date-fns"
import {
  Building2, Users, Activity, BarChart3, Lock,
  Plus, ChevronDown, ChevronUp, Check, X,
  ToggleLeft, ToggleRight, AlertTriangle, RefreshCw,
  Shield, Clock, Newspaper, Zap, Settings,
  CheckCircle, XCircle, Loader, Edit2, Save, LogOut,
  UserCircle, Trash2, UserPlus, Mail, Unlock, FileText,
} from "lucide-react"
import { adminSignOut } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"
import {
  getAdminStats,
  getOrganisations,
  createOrganisation,
  updateOrgPlan,
  updateOrgFeature,
  setOrgActive,
  updateOrgNotes,
  getPlatformUsers,
  approveUser,
  suspendUser,
  setUserRole,
  addUserToOrg,
  getOrgMembers,
  updateMemberRole,
  updateMemberByline,
  removeUserFromOrg,
  getScraperSources,
  toggleScraperSource,
  resetScraperErrors,
  getPipelineHeartbeats,
  getFeatureFlags,
  type Organisation,
  type OrgMemberDetail,
  type PlatformUser,
  type ScraperSource,
  type PipelineHeartbeat,
  type FeatureFlag,
  type OrgPlan,
  type OrgType,
  type AdminStats,
} from "@/lib/admin-api"
import { ReportsTab } from "@/components/admin/ReportsTab"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UserAccess = {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  created_at: string
  is_verified: boolean
  approved_at: string | null
  approved_by: string | null
  platform_role: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLANS: OrgPlan[] = ["trial", "newsroom", "agency", "institution", "custom"]
const ORG_TYPES: OrgType[] = ["publication", "agency", "institution", "independent"]
const ROLES = ["reader", "journalist", "researcher", "admin"]
const ORG_ROLES = ["viewer", "journalist", "analyst", "editor", "owner"]

const PLAN_COLORS: Record<string, string> = {
  trial:       "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30",
  newsroom:    "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30",
  agency:      "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30",
  institution: "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30",
  custom:      "text-foreground border-border bg-muted/40",
}

const TIER_COLORS: Record<string, string> = {
  wire:        "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30",
  breaking:    "text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30",
  core:        "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30",
  independent: "text-muted-foreground border-border bg-muted/40",
  custom:      "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30",
}

// ─────────────────────────────────────────────────────────────────────────────
// Small shared components
// ─────────────────────────────────────────────────────────────────────────────

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {label}
    </span>
  )
}

function StatCard({ label, value, sub, icon: Icon, alert }: {
  label: string; value: number | string; sub?: string
  icon: any; alert?: boolean
}) {
  return (
    <div className={`rounded-xl border bg-card shadow-sm p-5 space-y-1 ${alert ? "border-amber-300 dark:border-amber-700" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <Icon className={`h-4 w-4 ${alert ? "text-amber-500" : "text-muted-foreground/50"}`} />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function Toggle({ enabled, onChange, disabled }: {
  enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        enabled
          ? "text-green-600 dark:text-green-400"
          : "text-muted-foreground"
      } disabled:opacity-40`}
    >
      {enabled
        ? <ToggleRight className="h-5 w-5" />
        : <ToggleLeft  className="h-5 w-5" />
      }
      {enabled ? "On" : "Off"}
    </button>
  )
}

function SectionHeader({ title, sub, action }: {
  title: string; sub?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return (
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
      <Loader className="h-4 w-4 animate-spin" /> Loading stats…
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Organisations"  value={stats.total_orgs}     sub={`${stats.active_orgs} active`}    icon={Building2} />
        <StatCard label="On trial"       value={stats.trial_orgs}     sub="need conversion"                  icon={Clock}     alert={stats.trial_orgs > 0} />
        <StatCard label="Users"          value={stats.total_users}    sub={`${stats.pending_users} pending`} icon={Users}     alert={stats.pending_users > 0} />
        <StatCard label="Active sources" value={stats.active_sources} sub="scrapers running"                 icon={Activity}  />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total articles" value={stats.total_articles.toLocaleString()} sub="in database"  icon={Newspaper} />
        <StatCard label="Articles today" value={stats.articles_today.toLocaleString()} sub="ingested 24h" icon={Zap} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Organisations
// ─────────────────────────────────────────────────────────────────────────────

function CreateOrgForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "", slug: "", type: "publication" as OrgType,
    primary_email: "", plan: "trial" as OrgPlan,
    max_seats: 5, notes: "",
  })

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  async function handleCreate() {
    if (!form.name || !form.slug || !form.primary_email) return
    setSaving(true)
    try {
      await createOrganisation(form)
      setOpen(false)
      setForm({ name: "", slug: "", type: "publication", primary_email: "", plan: "trial", max_seats: 5, notes: "" })
      onCreated()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition"
    >
      <Plus className="h-3.5 w-3.5" /> Register org
    </button>
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Register new organisation</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Name", key: "name", placeholder: "Hindustan Times" },
          { label: "Slug", key: "slug", placeholder: "hindustan-times" },
          { label: "Primary email", key: "primary_email", placeholder: "editor@ht.com" },
        ].map(f => (
          <div key={f.key} className={f.key === "primary_email" ? "col-span-2" : ""}>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">{f.label}</label>
            <input
              value={(form as any)[f.key]}
              onChange={e => {
                const v = e.target.value
                setForm(p => ({
                  ...p,
                  [f.key]: v,
                  ...(f.key === "name" ? { slug: autoSlug(v) } : {}),
                }))
              }}
              placeholder={f.placeholder}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            />
          </div>
        ))}

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Type</label>
          <select
            value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value as OrgType }))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Plan</label>
          <select
            value={form.plan}
            onChange={e => setForm(p => ({ ...p, plan: e.target.value as OrgPlan }))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Max seats</label>
          <input
            type="number"
            min={1} max={500}
            value={form.max_seats}
            onChange={e => setForm(p => ({ ...p, max_seats: Number(e.target.value) }))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="col-span-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Internal notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="e.g. Contact: Priya Singh, CTO. Demo call on 15 April."
            rows={2}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={saving || !form.name || !form.slug || !form.primary_email}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
      >
        {saving ? <><Loader className="h-4 w-4 animate-spin" /> Creating…</> : "Create organisation"}
      </button>
    </div>
  )
}

function OrgMembersPanel({ org, allUsers, onRefresh }: {
  org: Organisation
  allUsers: PlatformUser[]
  onRefresh: () => void
}) {
  const [members,    setMembers]    = useState<OrgMemberDetail[]>([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState<string | null>(null)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editByline, setEditByline] = useState("")
  const [editDesk,   setEditDesk]   = useState("")
  const [addUserId,  setAddUserId]  = useState("")
  const [addRole,    setAddRole]    = useState("journalist")
  const [addByline,  setAddByline]  = useState("")
  const [addDesk,    setAddDesk]    = useState("")
  const [addOpen,    setAddOpen]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setMembers(await getOrgMembers(org.id)) }
    catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [org.id])

  useEffect(() => { load() }, [load])

  async function handleRoleChange(userId: string, role: string) {
    setSaving(userId + "-role")
    try { await updateMemberRole(org.id, userId, role); await load() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from the org?")) return
    setSaving(userId + "-remove")
    try { await removeUserFromOrg(userId, org.id); await load(); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  function startEditByline(m: OrgMemberDetail) {
    setEditingId(m.user_id)
    setEditByline(m.byline_name ?? "")
    setEditDesk(m.desk ?? "")
  }

  async function saveByline(userId: string) {
    setSaving(userId + "-byline")
    try {
      await updateMemberByline(org.id, userId, editByline || null, editDesk || null)
      setEditingId(null)
      await load()
    }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleAdd() {
    if (!addUserId) return
    setSaving("add")
    try {
      await addUserToOrg({
        user_id:     addUserId,
        org_id:      org.id,
        role:        addRole,
        byline_name: addByline || undefined,
        desk:        addDesk   || undefined,
      })
      setAddOpen(false)
      setAddUserId(""); setAddRole("journalist"); setAddByline(""); setAddDesk("")
      await load(); onRefresh()
    }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  const existingUserIds = new Set(members.filter(m => m.is_active).map(m => m.user_id))
  const eligibleUsers   = allUsers.filter(u => !existingUserIds.has(u.id))
  const activeMembers   = members.filter(m => m.is_active)
  const inactiveMembers = members.filter(m => !m.is_active)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Members ({activeMembers.length} / {org.max_seats} seats)
        </p>
        <button
          onClick={() => setAddOpen(o => !o)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border bg-card hover:bg-muted/30 text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <UserPlus className="h-3 w-3" />
          Add member
        </button>
      </div>

      {addOpen && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <p className="text-xs font-medium">Add existing user to org</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">User</label>
              <select
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select user…</option>
                {eligibleUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.display_name || u.email || "Unnamed"} — {u.email ?? u.id.slice(0,8)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Org role</label>
              <select
                value={addRole}
                onChange={e => setAddRole(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {ORG_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Desk (optional)</label>
              <input
                value={addDesk}
                onChange={e => setAddDesk(e.target.value)}
                placeholder="e.g. Politics"
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium block mb-1">Byline name (optional)</label>
              <input
                value={addByline}
                onChange={e => setAddByline(e.target.value)}
                placeholder="e.g. Priya Singh"
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={!addUserId || saving === "add"}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving === "add" ? "Adding…" : "Add to org"}
            </button>
            <button onClick={() => setAddOpen(false)} className="text-xs text-muted-foreground hover:text-foreground transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader className="h-3.5 w-3.5 animate-spin" /> Loading members…
        </div>
      ) : activeMembers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">No active members yet.</p>
      ) : (
        <div className="divide-y rounded-lg border bg-card overflow-hidden">
          {activeMembers.map(m => (
            <div key={m.user_id} className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary uppercase shrink-0">
                  {(m.full_name ?? "?").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">
                    {m.full_name ?? <span className="text-muted-foreground italic">Unnamed user</span>}
                    {!m.approved_at && (
                      <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400 font-normal">pending approval</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {m.byline_name ? `Byline: ${m.byline_name}` : "No byline"}
                    {m.desk ? ` · ${m.desk} desk` : ""}
                    {m.last_seen_at ? ` · Last seen ${formatDistanceToNow(parseISO(m.last_seen_at), { addSuffix: true })}` : ""}
                  </p>
                </div>
                <select
                  value={m.role}
                  onChange={e => handleRoleChange(m.user_id, e.target.value)}
                  disabled={saving === m.user_id + "-role"}
                  className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 shrink-0"
                >
                  {ORG_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  onClick={() => editingId === m.user_id ? setEditingId(null) : startEditByline(m)}
                  className="text-muted-foreground hover:text-foreground transition shrink-0"
                  title="Edit byline / desk"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleRemove(m.user_id)}
                  disabled={saving === m.user_id + "-remove"}
                  className="text-muted-foreground hover:text-destructive transition shrink-0"
                  title="Remove from org"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {editingId === m.user_id && (
                <div className="flex items-center gap-2 ml-10 flex-wrap">
                  <input
                    value={editByline}
                    onChange={e => setEditByline(e.target.value)}
                    placeholder="Byline name"
                    className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground w-36"
                  />
                  <input
                    value={editDesk}
                    onChange={e => setEditDesk(e.target.value)}
                    placeholder="Desk"
                    className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground w-28"
                  />
                  <button
                    onClick={() => saveByline(m.user_id)}
                    disabled={saving === m.user_id + "-byline"}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" /> Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {inactiveMembers.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          + {inactiveMembers.length} removed member{inactiveMembers.length !== 1 ? "s" : ""} (hidden)
        </p>
      )}
    </div>
  )
}

function OrgRow({ org, flags, allUsers, onRefresh }: {
  org: Organisation; flags: FeatureFlag[]; allUsers: PlatformUser[]; onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState<string | null>(null)
  const [notes,    setNotes]    = useState(org.notes || "")
  const [editNotes, setEditNotes] = useState(false)

  async function toggleFeature(key: string, val: boolean) {
    setSaving(key)
    try { await updateOrgFeature(org.id, key, val); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function changePlan(plan: OrgPlan) {
    setSaving("plan")
    try { await updateOrgPlan(org.id, plan); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function toggleActive() {
    setSaving("active")
    try { await setOrgActive(org.id, !org.is_active); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function saveNotes() {
    await updateOrgNotes(org.id, notes)
    setEditNotes(false)
  }

  const trialDaysLeft = org.trial_ends_at
    ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${!org.is_active ? "opacity-60" : ""}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{org.name}</span>
            <Chip label={org.plan} cls={PLAN_COLORS[org.plan] ?? "text-muted-foreground border-border bg-muted/40"} />
            <Chip label={org.type} cls="text-muted-foreground border-border bg-muted/40" />
            {!org.is_active && <Chip label="Suspended" cls="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30" />}
            {trialDaysLeft !== null && trialDaysLeft <= 7 && trialDaysLeft > 0 && (
              <Chip label={`Trial: ${trialDaysLeft}d left`} cls="text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30" />
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            {org.primary_email} · {org.member_count} member{org.member_count !== 1 ? "s" : ""} · {org.max_seats} seats
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-4 space-y-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Plan</label>
              <select
                value={org.plan}
                onChange={e => changePlan(e.target.value as OrgPlan)}
                disabled={saving === "plan"}
                className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <button
              onClick={toggleActive}
              disabled={saving === "active"}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                org.is_active
                  ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
              }`}
            >
              {org.is_active ? "Suspend org" : "Reactivate org"}
            </button>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Features</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-6">
              {flags.map(f => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{f.label}</p>
                    {f.description && <p className="text-[10px] text-muted-foreground truncate">{f.description}</p>}
                  </div>
                  <Toggle
                    enabled={org.features?.[f.key] ?? f.default_value}
                    onChange={val => toggleFeature(f.key, val)}
                    disabled={saving === f.key}
                  />
                </div>
              ))}
            </div>
          </div>

          <OrgMembersPanel org={org} allUsers={allUsers} onRefresh={onRefresh} />

          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Internal notes</p>
              {!editNotes
                ? <button onClick={() => setEditNotes(true)} className="text-xs text-primary hover:underline flex items-center gap-1"><Edit2 className="h-3 w-3" /> Edit</button>
                : <button onClick={saveNotes} className="text-xs text-primary hover:underline flex items-center gap-1"><Save className="h-3 w-3" /> Save</button>
              }
            </div>
            {editNotes
              ? <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              : <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {notes || <span className="italic">No notes.</span>}
                </p>
            }
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs text-muted-foreground font-mono">
            <span>Created {formatDistanceToNow(parseISO(org.created_at), { addSuffix: true })}</span>
            {org.plan_expires_at && <span>Expires {format(parseISO(org.plan_expires_at), "d MMM yyyy")}</span>}
            <span className="font-mono text-[10px]">{org.id.slice(0, 12).toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function OrgsTab({ flags }: { flags: FeatureFlag[] }) {
  const [orgs,     setOrgs]     = useState<Organisation[]>([])
  const [allUsers, setAllUsers] = useState<PlatformUser[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [o, u] = await Promise.all([getOrganisations(), getPlatformUsers()])
      setOrgs(o)
      setAllUsers(u)
    }
    catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = orgs.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) ||
    (o.primary_email || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <SectionHeader
        title={`Organisations (${orgs.length})`}
        sub="Manage plans, features, and access per organisation."
        action={<CreateOrgForm onCreated={load} />}
      />
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search orgs…"
        className="w-full rounded-lg border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
      />
      {loading
        ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2"><Loader className="h-4 w-4 animate-spin" /> Loading…</div>
        : filtered.length === 0
        ? <p className="text-sm text-muted-foreground text-center py-12">No organisations yet.</p>
        : <div className="space-y-2">{filtered.map(o => <OrgRow key={o.id} org={o} flags={flags} allUsers={allUsers} onRefresh={load} />)}</div>
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3: Users
// ─────────────────────────────────────────────────────────────────────────────

function UserRow({ user, orgs, onRefresh }: {
  user: PlatformUser; orgs: Organisation[]; onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [addOrgId, setAddOrgId] = useState("")
  const [addRole,  setAddRole]  = useState("journalist")

  const isPending = !user.approved_at

  async function handleApprove() {
    setSaving(true)
    try { await approveUser(user.id); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  async function handleSuspend() {
    setSaving(true)
    try { await suspendUser(user.id); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  async function handleRoleChange(role: string) {
    setSaving(true)
    try { await setUserRole(user.id, role); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  async function handleAddToOrg() {
    if (!addOrgId) return
    setSaving(true)
    try { await addUserToOrg({ user_id: user.id, org_id: addOrgId, role: addRole }); onRefresh() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className={`rounded-xl border bg-card shadow-sm overflow-hidden ${!user.is_active ? "opacity-60" : ""}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 uppercase">
          {(user.full_name || user.display_name || user.email || "?").charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{user.full_name || user.display_name || user.email || "Unnamed user"}</span>
            <Chip
              label={user.platform_role}
              cls={user.platform_role === "admin"
                ? "text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30"
                : "text-muted-foreground border-border bg-muted/40"
              }
            />
            {isPending && <Chip label="Pending approval" cls="text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30" />}
            {!user.is_active && <Chip label="Suspended" cls="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30" />}
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {user.email && <span className="text-foreground/70">{user.email} · </span>}Joined {formatDistanceToNow(parseISO(user.created_at), { addSuffix: true })}
            {user.last_seen_at && ` · Last seen ${formatDistanceToNow(parseISO(user.last_seen_at), { addSuffix: true })}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {isPending && (
              <button onClick={handleApprove} disabled={saving}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30 font-medium transition-colors">
                <Check className="h-3 w-3" /> Approve
              </button>
            )}
            <button onClick={handleSuspend} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 font-medium transition-colors">
              <X className="h-3 w-3" /> Suspend
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Platform role</label>
              <select value={user.platform_role} onChange={e => handleRoleChange(e.target.value)} disabled={saving}
                className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Org memberships</p>
            {(user.org_memberships || []).length === 0
              ? <p className="text-xs text-muted-foreground italic">Not in any org.</p>
              : <div className="flex flex-wrap gap-2 mb-3">
                  {user.org_memberships!.map(m => (
                    <span key={m.id} className="text-xs px-2 py-1 rounded-lg border bg-muted/30 text-muted-foreground">
                      {m.org_name} <span className="opacity-60">· {m.role}</span>
                    </span>
                  ))}
                </div>
            }
            <div className="flex items-center gap-2 flex-wrap">
              <select value={addOrgId} onChange={e => setAddOrgId(e.target.value)}
                className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Add to org…</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={addRole} onChange={e => setAddRole(e.target.value)}
                className="rounded-lg border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                {ORG_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleAddToOrg} disabled={!addOrgId || saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersTab({ orgs }: { orgs: Organisation[] }) {
  const [users,   setUsers]   = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<"all" | "pending" | "journalist" | "reader">("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPlatformUsers(
        filter === "pending" ? { pending: true } :
        filter === "all"     ? {} :
        { role: filter }
      )
      setUsers(data)
    } catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const pending = users.filter(u => !u.approved_at)

  return (
    <div className="space-y-4">
      <SectionHeader title={`Users (${users.length})`} sub="Approve access, assign org roles, manage platform roles." />
      {pending.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {pending.length} user{pending.length !== 1 ? "s" : ""} waiting for approval
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "journalist", "reader"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading
        ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2"><Loader className="h-4 w-4 animate-spin" /> Loading…</div>
        : users.length === 0
        ? <p className="text-sm text-muted-foreground text-center py-12">No users found.</p>
        : <div className="space-y-2">{users.map(u => <UserRow key={u.id} user={u} orgs={orgs} onRefresh={load} />)}</div>
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 4: Permissions
// ─────────────────────────────────────────────────────────────────────────────

function UserAccessRow({
  user, onApprove, onDeny, onRevoke, saving, notifySending,
}: {
  user: UserAccess
  onApprove: () => void
  onDeny: () => void
  onRevoke: () => void
  saving: boolean
  notifySending: boolean
}) {
  const age = formatDistanceToNow(parseISO(user.created_at), { addSuffix: true })
  const isApproved = user.is_verified || !!user.approved_at

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{user.full_name || user.display_name || "Unnamed user"}</span>
              <Chip label={isApproved ? "Approved" : "Pending"} cls={
                isApproved
                  ? "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                  : "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
              } />
              <Chip label={user.platform_role} cls="text-muted-foreground border-border bg-muted/40" />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className="font-mono">{user.email}</span>
              <span>Joined {age}</span>
            </div>
          </div>
        </div>
        {!isApproved ? (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <button onClick={onApprove} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30 font-medium transition-colors disabled:opacity-50">
              <Check className="h-3 w-3" /> Approve
            </button>
            <button onClick={onDeny} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 font-medium transition-colors disabled:opacity-50">
              <X className="h-3 w-3" /> Deny
            </button>
            {notifySending && <span className="text-xs text-muted-foreground ml-auto">Sending notification…</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
              <Unlock className="h-3 w-3" /> Full access
            </span>
            <button onClick={onRevoke} disabled={saving}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 font-medium transition-colors disabled:opacity-50 ml-auto">
              <Lock className="h-3 w-3" /> Revoke access
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PermissionsTab() {
  const [users, setUsers] = useState<UserAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "inactive">("pending")
  const [saving, setSaving] = useState<string | null>(null)
  const [notifySending, setNotifySending] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from("users")
        .select("id, email, full_name, display_name, created_at, is_verified, approved_at, approved_by, platform_role")
        .order("created_at", { ascending: false })
      if (filter === "pending")  query = query.eq("is_verified", false).is("approved_at", null)
      else if (filter === "approved") query = query.eq("is_verified", true)
      else if (filter === "inactive") query = query.eq("is_active", false)
      const { data, error } = await query
      if (!error && data) setUsers(data as UserAccess[])
    } catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function handleApprove(userId: string, email: string) {
    setSaving(userId)
    try {
      await supabase.from("users").update({ is_verified: true, approved_at: new Date().toISOString(), approved_by: "admin" }).eq("id", userId)
      await sendNotification(email, "approved")
      await load()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleDeny(userId: string, email: string) {
    if (!confirm("Deny access to this user?")) return
    setSaving(userId)
    try { await sendNotification(email, "denied"); await load() }
    catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function handleRevoke(userId: string, email: string) {
    if (!confirm("Revoke access for this user?")) return
    setSaving(userId)
    try {
      await supabase.from("users").update({ is_verified: false, approved_at: null }).eq("id", userId)
      await sendNotification(email, "revoked")
      await load()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(null) }
  }

  async function sendNotification(email: string, status: string) {
    setNotifySending(email)
    try {
      await fetch("/api/send-access-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, status }),
      })
    } catch { /* non-fatal */ }
    finally { setNotifySending(null) }
  }

  const pending = users.filter(u => !u.is_verified && !u.approved_at)

  return (
    <div className="space-y-4">
      <SectionHeader title="Intelligence Observatory Access" sub="Approve users for full access to story clusters, narrative arcs, and publisher intelligence." />
      {pending.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {pending.length} user{pending.length !== 1 ? "s" : ""} awaiting approval
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "all", "inactive"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              filter === f ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-background border-border text-muted-foreground hover:text-foreground"
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-1.5 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading
        ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2"><Loader className="h-4 w-4 animate-spin" /> Loading users…</div>
        : users.length === 0
        ? <div className="text-center py-12 text-sm text-muted-foreground">No users in this category.</div>
        : <div className="space-y-2">
            {users.map(u => (
              <UserAccessRow
                key={u.id} user={u}
                onApprove={() => handleApprove(u.id, u.email)}
                onDeny={() => handleDeny(u.id, u.email)}
                onRevoke={() => handleRevoke(u.id, u.email)}
                saving={saving === u.id}
                notifySending={notifySending === u.email}
              />
            ))}
          </div>
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 5: Pipeline
// ─────────────────────────────────────────────────────────────────────────────

function HeartbeatRow({ hb }: { hb: PipelineHeartbeat }) {
  const age   = formatDistanceToNow(parseISO(hb.last_run), { addSuffix: true })
  const ageMs = Date.now() - new Date(hb.last_run).getTime()
  const stale = ageMs > 2 * 3600 * 1000
  const dead  = ageMs > 6 * 3600 * 1000
  const statusCls = dead ? "text-red-600 dark:text-red-400" : stale ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
  const StatusIcon = dead ? XCircle : stale ? AlertTriangle : CheckCircle
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <StatusIcon className={`h-4 w-4 shrink-0 ${statusCls}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium font-mono">{hb.job_name}</p>
        <p className="text-xs text-muted-foreground">
          {age} · {hb.articles_processed} processed · {hb.articles_failed} failed
          {hb.duration_seconds && ` · ${hb.duration_seconds.toFixed(1)}s`}
        </p>
        {hb.error_message && <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">{hb.error_message}</p>}
      </div>
      <span className={`text-xs font-mono ${statusCls}`}>{hb.status}</span>
    </div>
  )
}

function SourceRow({ source, onToggle, onReset }: {
  source: ScraperSource
  onToggle: (id: string, active: boolean) => Promise<void>
  onReset:  (id: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const hasErrors = source.consecutive_failures > 0

  return (
    <div className={`flex items-center gap-3 py-3 border-b last:border-0 ${!source.is_active ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{source.name}</span>
          <Chip label={source.tier} cls={TIER_COLORS[source.tier] ?? "text-muted-foreground border-border bg-muted/40"} />
          {source.language !== "en" && <Chip label={source.language.toUpperCase()} cls="text-muted-foreground border-border bg-muted/40" />}
          {hasErrors && <Chip label={`${source.consecutive_failures} failures`} cls="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30" />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every {source.scrape_interval_minutes ?? "?"} min · {source.articles_today} today · {source.articles_total.toLocaleString()} total
          {source.last_scraped_at && ` · ${formatDistanceToNow(parseISO(source.last_scraped_at), { addSuffix: true })}`}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {hasErrors && (
          <button onClick={async () => { setSaving(true); try { await onReset(source.id) } finally { setSaving(false) } }}
            disabled={saving} className="text-xs text-muted-foreground hover:text-foreground transition-colors" title="Reset error count">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <Toggle enabled={source.is_active}
          onChange={async (v) => { setSaving(true); try { await onToggle(source.id, v) } finally { setSaving(false) } }}
          disabled={saving} />
      </div>
    </div>
  )
}

function PipelineTab() {
  const [heartbeats, setHeartbeats] = useState<PipelineHeartbeat[]>([])
  const [sources,    setSources]    = useState<ScraperSource[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tierFilter, setTierFilter] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [hbs, srcs] = await Promise.all([getPipelineHeartbeats(), getScraperSources()])
      setHeartbeats(hbs)
      setSources(srcs)
    } catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const tiers = ["all", ...Array.from(new Set(sources.map(s => s.tier)))]
  const filteredSources = tierFilter === "all" ? sources : sources.filter(s => s.tier === tierFilter)

  async function handleToggle(id: string, active: boolean) {
    await toggleScraperSource(id, active)
    setSources(s => s.map(src => src.id === id ? { ...src, is_active: active } : src))
  }

  async function handleReset(id: string) {
    await resetScraperErrors(id)
    setSources(s => s.map(src => src.id === id ? { ...src, consecutive_failures: 0, error_count: 0, last_error: null } : src))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
      <Loader className="h-4 w-4 animate-spin" /> Loading pipeline…
    </div>
  )

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pipeline monitor"
        sub="Scraper job status, source health, and heartbeat monitoring."
        action={<button onClick={load} className="p-1.5 rounded-lg border bg-card text-muted-foreground hover:text-foreground transition-colors"><RefreshCw className="h-3.5 w-3.5" /></button>}
      />
      {heartbeats.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Job heartbeats</p>
          {heartbeats.map(hb => <HeartbeatRow key={hb.job_name} hb={hb} />)}
        </div>
      )}
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Scraper sources ({sources.filter(s => s.is_active).length}/{sources.length} active)
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {tiers.map(t => (
              <button key={t} onClick={() => setTierFilter(t)}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                  tierFilter === t ? "bg-primary/10 border-primary/30 text-primary font-medium" : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {filteredSources.map(s => <SourceRow key={s.id} source={s} onToggle={handleToggle} onReset={handleReset} />)}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "overview" | "orgs" | "users" | "permissions" | "pipeline" | "reports"

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview",     label: "Overview",     icon: BarChart3  },
  { id: "orgs",         label: "Orgs",         icon: Building2  },
  { id: "users",        label: "Users",        icon: Users      },
  { id: "permissions",  label: "Permissions",  icon: Lock       },
  { id: "pipeline",     label: "Pipeline",     icon: Activity   },
  { id: "reports",      label: "Reports",      icon: FileText   },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab,   setTab]   = useState<Tab>("overview")
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [orgs,  setOrgs]  = useState<Organisation[]>([])

  useEffect(() => {
    Promise.all([getAdminStats(), getFeatureFlags(), getOrganisations()])
      .then(([s, f, o]) => { setStats(s); setFlags(f); setOrgs(o) })
      .catch(console.error)
  }, [])

  async function handleSignOut() {
    await adminSignOut()
    navigate("/admin/login", { replace: true })
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 lg:px-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Admin</h1>
            <p className="text-xs text-muted-foreground font-mono">SCRY control panel · restricted access</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border rounded-lg px-3 py-1.5 hover:border-muted-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {/* Tabs — scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-1 border-b min-w-max">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "overview"    && <OverviewTab stats={stats} />}
      {tab === "orgs"        && <OrgsTab flags={flags} />}
      {tab === "users"       && <UsersTab orgs={orgs} />}
      {tab === "permissions" && <PermissionsTab />}
      {tab === "pipeline"    && <PipelineTab />}
      {tab === "reports"     && <ReportsTab />}

    </div>
  )
}
