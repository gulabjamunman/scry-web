import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { Telescope, ArrowLeft, Mail } from "lucide-react"

export default function ForgotPasswordPage() {
  const navigate  = useNavigate()
  const [email,     setEmail]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/reset-password` }
    )

    setLoading(false)

    if (err) {
      setError("Something went wrong. Please check the email address and try again.")
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">Check your inbox</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a password reset link to{" "}
              <span className="font-medium text-foreground">{email}</span>.
              It expires in 1 hour.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground leading-relaxed space-y-1 text-left">
            <p className="font-medium text-foreground">Didn't receive it?</p>
            <p>Check your spam or junk folder. If it's still not there, wait a minute and try again below.</p>
          </div>
          <button
            onClick={() => { setSent(false); setEmail("") }}
            className="text-sm text-primary hover:underline"
          >
            Try a different email address
          </button>
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
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
            <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your email and we'll send you a reset link.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </button>

      </div>
    </div>
  )
}
