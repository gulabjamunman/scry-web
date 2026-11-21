import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { Telescope, CheckCircle, Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password,    setPassword]    = useState("")
  const [confirm,     setConfirm]     = useState("")
  const [showPw,      setShowPw]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [done,        setDone]        = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  // Supabase sends the recovery token in the URL hash.
  // We need to wait for the auth state change that processes it
  // before allowing the password update.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setSessionReady(true)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)

    const { error: err } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (err) {
      setError(err.message || "Failed to update password. The reset link may have expired.")
      return
    }

    setDone(true)

    // Auto-redirect to login after 3 seconds
    setTimeout(() => navigate("/login"), 3000)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">Password updated</h1>
            <p className="text-sm text-muted-foreground">
              Your password has been changed. Redirecting you to sign in…
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Sign in now
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Telescope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Set a new password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose something you haven't used before.
            </p>
          </div>
        </div>

        {!sessionReady && (
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground text-center">
            Verifying your reset link…
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">New password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border bg-card px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Confirm new password</label>
            <input
              type={showPw ? "text" : "password"}
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your new password"
              className="w-full rounded-lg border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>

          {/* Password match indicator */}
          {confirm.length > 0 && (
            <p className={`text-xs ${password === confirm ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {password === confirm ? "✓ Passwords match" : "Passwords do not match"}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !sessionReady}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

      </div>
    </div>
  )
}
