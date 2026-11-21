// src/lib/admin-auth.ts

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js"

const adminSupabase: SupabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey:         "scry-admin-session",
      storage:            window.sessionStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
    },
  }
)

export { adminSupabase }

export async function adminSignIn(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  // Step 1: sign in
  const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Login failed" }
  }

  // Step 2: check role via RPC (bypasses RLS)
  const { data: role, error: rpcError } = await adminSupabase.rpc("get_my_role")

  if (rpcError || role !== "admin") {
    await adminSupabase.auth.signOut()
    return { ok: false, error: "This account does not have admin access." }
  }

  return { ok: true }
}

export async function adminSignOut(): Promise<void> {
  await adminSupabase.auth.signOut()
}

export async function getAdminSession(): Promise<Session | null> {
  const { data } = await adminSupabase.auth.getSession()
  return data.session
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const session = await getAdminSession()
  if (!session) return false

  const { data: role } = await adminSupabase.rpc("get_my_role")
  return role === "admin"
}
