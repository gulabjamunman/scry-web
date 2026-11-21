import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Telescope, UserPlus, Eye, EyeOff, Mail, ArrowRight } from "lucide-react"
import { signUp, resendConfirmationEmail } from "@/lib/auth"

type Stage = "form" | "check-email" | "error"

export default function SignupPage() {
  const navigate = useNavigate()

  // Form state
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)

  // UI state
  const [stage, setStage] = useState<Stage>("form")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)

  // Validation
  function validateForm(): string | null {
    if (!name.trim()) return "Please enter your name"
    if (!email.trim()) return "Please enter your email"
    if (password.length < 6) return "Password must be at least 6 characters"
    if (password !== confirmPassword) return "Passwords don't match"
    return null
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await signUp(email, password, name)

      // Either way, go to check-email screen
      // They'll need to verify whether their email was confirmed or needs verification
      setEmail(result.user.email || email)
      setStage("check-email")
    } catch (err: any) {
      setError(err.message || "Account creation failed. Try again or contact hello@scry.in")
      setStage("error")
    } finally {
      setLoading(false)
    }
  }

  async function handleResendEmail() {
    setResendLoading(true)
    setError(null)

    try {
      await resendConfirmationEmail(email)
      setError(null)
    } catch (err: any) {
      setError(err.message || "Failed to resend email")
    } finally {
      setResendLoading(false)
    }
  }

  function handleBackToForm() {
    setStage("form")
    setError(null)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 1: FORM
  // ──────────────────────────────────────────────────────────────────────────

  if (stage === "form") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
              <Telescope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Create your account</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Get full access to the Intelligence Observatory
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Priya Singh"
                className="w-full rounded-lg border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground"
              />
            </div>

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
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <input
                  type={passwordVisible ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirm password</label>
              <div className="relative">
                <input
                  type={confirmPasswordVisible ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full rounded-lg border bg-card px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  title={confirmPasswordVisible ? "Hide password" : "Show password"}
                >
                  {confirmPasswordVisible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          {/* Sign in link */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">
                Already have an account?
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate("/login")}
            className="w-full rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition"
          >
            Sign in
          </button>

          {/* Info box */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1">
            <p>
              We'll send you a confirmation email. Click the link to verify your account.
            </p>
            <p>
              Once confirmed, you'll have instant access to all story clusters, narrative arcs, and publisher silence maps.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 2: CHECK EMAIL
  // ──────────────────────────────────────────────────────────────────────────

  if (stage === "check-email") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {/* Icon */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>

          {/* Heading */}
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We've sent a confirmation link to <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          {/* Instructions */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">Next steps:</span>
            </p>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="font-semibold text-foreground">1.</span>
                <span>Check your inbox (and spam folder) for an email from SCRY</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-foreground">2.</span>
                <span>Click the "Confirm your email" button in the email</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-foreground">3.</span>
                <span>You'll be logged in and have full access to the Observatory</span>
              </li>
            </ol>
          </div>

          {/* Resend */}
          <div className="space-y-3">
            <button
              onClick={handleResendEmail}
              disabled={resendLoading}
              className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition disabled:opacity-50"
            >
              {resendLoading ? "Sending…" : "Resend confirmation email"}
            </button>

            {error && (
              <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
            )}
          </div>

          {/* Back button */}
          <button
            onClick={handleBackToForm}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition"
          >
            ← Use different email
          </button>

          {/* Info */}
          <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p>
              <span className="font-semibold">Email confirmed?</span> Your account is immediately active.
            </p>
            <p>
              Can't find the email?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-primary hover:underline"
              >
                Try signing in
              </button>
              — we'll tell you if there's an issue.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STAGE 3: ERROR
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleBackToForm}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            Try again
          </button>
          <button
            onClick={() => navigate("/")}
            className="w-full rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition"
          >
            Go home
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          If the problem persists, email <span className="text-foreground font-medium">hello@scry.in</span>
        </p>
      </div>
    </div>
  )
}
