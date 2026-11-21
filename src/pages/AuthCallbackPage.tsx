import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get("code")
        const type = url.searchParams.get("type")

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }

        if (!alive) return

        if (type === "recovery") {
          navigate("/reset-password", { replace: true })
          return
        }

        navigate("/email-confirmed", { replace: true })
      } catch (err: any) {
        if (!alive) return
        setError(err?.message ?? "Could not complete sign-in callback.")
        setTimeout(() => navigate("/login", { replace: true }), 2000)
      }
    })()

    return () => {
      alive = false
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          {error ? "Couldn’t complete verification" : "Verifying your link…"}
        </h1>
        <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error ?? "Please wait while we complete your sign-in."}
        </p>
      </div>
    </div>
  )
}
