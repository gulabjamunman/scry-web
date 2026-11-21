import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Telescope, LogIn, UserPlus, Eye, EyeOff } from "lucide-react"
import { signIn } from "@/lib/auth"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const redirectTo = (location.state as any)?.redirectTo || "/clusters"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await signIn(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      // Provide helpful error messages
      if (err.message.includes("Email not confirmed")) {
        setError(
          "Please confirm your email first. Check your inbox for a confirmation link, or go to signup to resend it."
        )
      } else if (err.message.includes("Invalid login credentials")) {
        setError("Email or password is incorrect. Try again or reset your password.")
      } else {
        setError(err.message || "Sign in failed. Check your email and password.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Telescope className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Sign in to SCRY</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Access the Intelligence Observatory
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="priya@example.com"
              className="w-full rounded-lg border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Password</label>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                type={passwordVisible ? "text" : "password"}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full rounded-lg border bg-card px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible(!passwordVisible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                title={passwordVisible ? "Hide password" : "Show password"}
              >
                {passwordVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400 leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            <LogIn className="h-4 w-4" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs text-muted-foreground">
              New to SCRY?
            </span>
          </div>
        </div>

        {/* Sign up */}
        <button
          onClick={() => navigate("/signup")}
          className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted flex items-center justify-center gap-2 transition"
        >
          <UserPlus className="h-4 w-4" />
          Create an account
        </button>

        <p className="text-center text-xs text-muted-foreground leading-relaxed">
          Creating an account gives you instant access to all story clusters, narrative arcs, and publisher silence maps.
        </p>
      </div>
    </div>
  )
}
