import { supabase } from "./supabase"
import { createContext, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

type AuthContextType = {
  user: User | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

/* ============================================================
   SIGN UP — Create account + send confirmation email
============================================================ */

export async function signUp(email: string, password: string, name: string) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (authError) {
    console.error("Sign up error:", authError.message)
    throw authError
  }

  if (!authData.user) {
    throw new Error("Sign up failed — no user returned")
  }

  // 2. Create reviewer profile (even before email confirmation)
  // This way they're in the system, just not yet confirmed
  try {
    await supabase.from("reviewers").insert({
      auth_id: authData.user.id,
      name: name || email,
      email: email,
      active: true,
    })
  } catch (e) {
    console.error("Failed to create reviewer profile:", e)
    // Don't throw — the user auth is created, that's the important part
  }

  return {
    user: authData.user,
    needsEmailConfirmation: !authData.user.email_confirmed_at,
  }
}

/* ============================================================
   SIGN IN — Log in with email confirmation check
============================================================ */

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error("Sign in error:", error.message)
    throw error
  }

  if (!data.user) {
    throw new Error("Sign in failed — no user returned")
  }

  // Check if email is confirmed
  if (!data.user.email_confirmed_at) {
    throw new Error("Email not confirmed. Please check your inbox for a confirmation link.")
  }

  return data.user
}

/* ============================================================
   RESEND CONFIRMATION EMAIL
============================================================ */

export async function resendConfirmationEmail(email: string) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    console.error("Resend confirmation error:", error.message)
    throw error
  }
}

/* ============================================================
   PASSWORD RESET
============================================================ */

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })

  if (error) {
    console.error("Reset password error:", error.message)
    throw error
  }
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    console.error("Update password error:", error.message)
    throw error
  }
}

/* ============================================================
   SIGN OUT
============================================================ */

export async function signOut() {
  await supabase.auth.signOut()
}

/* ============================================================
   GET CURRENT USER
============================================================ */

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

/* ============================================================
   GET USER PERMISSIONS
   Check if user has access to full intelligence observatory
============================================================ */

export async function getUserPermissions(userId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("platform_role, is_verified, approved_at")
    .eq("id", userId)
    .single()

  if (error) {
    console.error("Get permissions error:", error.message)
    return null
  }

  return {
    hasIntelligenceAccess: data.is_verified || !!data.approved_at, // Approved = full access
    platformRole: data.platform_role,
    approvedAt: data.approved_at,
  }
}
