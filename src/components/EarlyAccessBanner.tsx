import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Lock, CheckCircle, Clock } from "lucide-react"
import { supabase } from "@/lib/supabase"

type Step = "idle" | "submitted" | "duplicate"

export function EarlyAccessBanner() {
  const navigate    = useNavigate()
  const [email,     setEmail]   = useState("")
  const [step,      setStep]    = useState<Step>("idle")
  const [loading,   setLoading] = useState(false)
  const [error,     setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    const normalised = email.trim().toLowerCase()

    try {
      const { error: err } = await supabase
        .from("early_access_requests")
        .insert({ email: normalised })

      if (err) {
        // 23505 = unique constraint violation — email already in system
        if (err.code === "23505") {
          setStep("duplicate")
          return
        }
        throw err
      }

      setStep("submitted")
    } catch {
      setError("Something went wrong. Email hello@scry.in directly.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />

      <div className="p-6 lg:p-8 space-y-5">

        {/* Badge */}
        <div className="flex items-center gap-2">
          <Lock className="h-3 w-3 text-primary" />
          <span className="text-xs font-mono tracking-widest text-primary uppercase">
            Early Access
          </span>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight leading-snug">
            Most people read the news.<br />
            <span className="text-primary">You can read how it's being written.</span>
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            SCRY tracks narrative patterns across 15 Indian news publishers in real time.
            The Intelligence Observatory shows you how any story moves through the media
            ecosystem — who broke it, how framing shifted, who stayed silent.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2">
          {["Story cluster intelligence", "Cross-outlet framing comparison", "Silence detection", "Epistemic integrity scoring"].map(f => (
            <span key={f} className="text-xs px-2.5 py-1 rounded-full border bg-muted/50 text-muted-foreground">
              {f}
            </span>
          ))}
        </div>

        {/* Step: idle — email form */}
        {step === "idle" && (
          <div className="space-y-3">
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="flex-1 rounded-lg border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-60 shrink-0"
              >
                {loading ? "Sending…" : <>Request access <ArrowRight className="h-3.5 w-3.5" /></>}
              </button>
            </form>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="text-primary hover:underline">
                Sign in
              </button>
            </p>
          </div>
        )}

        {/* Step: submitted — clear next steps */}
        {step === "submitted" && (
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <p className="text-sm font-medium">You're on the list.</p>
            </div>

            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</p>
              <ol className="space-y-2.5">
                {[
                  { n: "1", text: "We review requests and email you at " + email + " when approved." },
                  { n: "2", text: "Create your account so you're ready the moment access is granted." },
                  { n: "3", text: "Sign in and the Intelligence Observatory will be waiting for you." },
                ].map(s => (
                  <li key={s.n} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="font-mono text-primary shrink-0">{s.n}.</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => navigate("/signup")}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
              >
                Create your account now <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => navigate("/explorer")}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition text-center"
              >
                Explore the platform first
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              No spam. Approval usually takes 1–2 days.
            </p>
          </div>
        )}

        {/* Step: duplicate — already in the system */}
        {step === "duplicate" && (
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium">You've already requested access.</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We have your request on file for <span className="text-foreground font-medium">{email}</span> and will email you when it's approved. In the meantime, you can create your account so you're ready to go.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => navigate("/signup")}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
              >
                Create your account now <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => navigate("/login")}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition text-center"
              >
                Sign in instead
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
