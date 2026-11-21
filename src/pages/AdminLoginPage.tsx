// src/pages/AdminLoginPage.tsx
//
// Separate login page for admin access only.
// Lives at /admin/login — completely separate from /login.
// Uses the admin-auth client (sessionStorage, isolated session).

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Shield, Loader, AlertCircle, Eye, EyeOff } from "lucide-react"
import { adminSignIn, isAdminAuthenticated } from "@/lib/admin-auth"

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [signing,  setSigning]  = useState(false)

  // If already authenticated as admin, skip login
  useEffect(() => {
    isAdminAuthenticated().then(ok => {
      if (ok) navigate("/admin", { replace: true })
      else    setLoading(false)
    })
  }, [navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setError(null)
    setSigning(true)
    try {
      const result = await adminSignIn(email.trim(), password)
      if (result.ok) {
        navigate("/admin", { replace: true })
      } else {
        setError(result.error ?? "Login failed")
      }
    } catch (err: any) {
      setError(err.message ?? "Unexpected error")
    } finally {
      setSigning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen gap-2 text-sm text-muted-foreground">
      <Loader className="h-4 w-4 animate-spin" />
    </div>
  )

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Admin access</h1>
          <p className="text-sm text-muted-foreground">
            SCRY control panel. Restricted to administrators only.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="rounded-xl border bg-card shadow-sm p-6 space-y-4">

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Admin email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@scry.in"
              autoComplete="username"
              required
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground transition"
              />
              <button
                type="button"
                onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={signing || !email || !password}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {signing
              ? <><Loader className="h-4 w-4 animate-spin" /> Verifying…</>
              : <><Shield className="h-4 w-4" /> Sign in to admin</>
            }
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          This is not the regular SCRY login.{" "}
          <a href="/login" className="text-primary hover:underline">
            Go to user login →
          </a>
        </p>

      </div>
    </div>
  )
}
