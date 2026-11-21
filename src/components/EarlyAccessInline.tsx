import { useState } from "react"
import { ArrowRight, CheckCircle2, Loader } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { trackEarlyAccessSubmitted } from "@/lib/analytics"
import { useAuth } from "@/lib/auth"

/**
 * Inline early access email capture.
 * - If user is logged in: one-click submit using their email
 * - If not logged in: shows email input field
 * Inserts into early_access_requests on submit.
 * No redirect, no friction.
 */
export function EarlyAccessInline({ className = "" }: { className?: string }) {
  const { user } = useAuth()

  const [email,     setEmail]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSubmit() {
    const target = (user?.email ?? email).trim().toLowerCase()
    if (!target || !target.includes("@")) {
      setError("Enter a valid email address.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error: dbError } = await supabase
        .from("early_access_requests")
        .upsert({ email: target }, { onConflict: "email" })
      if (dbError) throw dbError
      setSubmitted(true)
      trackEarlyAccessSubmitted({ source: "homepage_cta", isLoggedIn: !!user })
    } catch {
      setError("Something went wrong — email hello@scry.in directly.")
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className={`flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3 ${className}`}>
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-medium text-primary">
          Request received — we'll be in touch soon.
        </p>
      </div>
    )
  }

  // Logged-in user: one-click
  if (user) {
    return (
      <div className={`space-y-2 ${className}`}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60 whitespace-nowrap"
        >
          {loading
            ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Sending…</>
            : <>Request early access <ArrowRight className="h-3.5 w-3.5" /></>
          }
        </button>
        <p className="text-xs text-muted-foreground">
          We'll email you at <span className="text-foreground">{user.email}</span>
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  // Unauthenticated: email input
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="your@email.com"
          className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground min-w-0"
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !email.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {loading
            ? <Loader className="h-3.5 w-3.5 animate-spin" />
            : <><ArrowRight className="h-3.5 w-3.5" /></>
          }
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">No spam. We review manually and reply personally.</p>
    </div>
  )
}