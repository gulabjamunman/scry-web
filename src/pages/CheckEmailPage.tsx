import { useLocation, useNavigate } from "react-router-dom"
import { Mail } from "lucide-react"

export default function CheckEmailPage() {
  const location = useLocation()
  const navigate  = useNavigate()
  const email     = location.state?.email     || null
  const isReset   = location.state?.isReset   || false   // true when coming from forgot password

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">
              {isReset ? "Check your inbox" : "One more step"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {email
                ? <>We sent a {isReset ? "password reset" : "confirmation"} link to <span className="font-medium text-foreground">{email}</span>.</>
                : <>We sent you a {isReset ? "password reset" : "confirmation"} link.</>
              }
            </p>
          </div>
        </div>

        {/* Context-specific instructions */}
        <div className="rounded-xl border bg-card shadow-sm p-5 space-y-3">
          {isReset ? (
            <>
              <p className="text-sm font-medium">What to do next</p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">1.</span>Open the email from SCRY</li>
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">2.</span>Click the reset link — it expires in 1 hour</li>
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">3.</span>Set your new password</li>
              </ol>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">What to do next</p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">1.</span>Open the email from SCRY</li>
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">2.</span>Click the confirmation link to activate your account</li>
                <li className="flex gap-2"><span className="text-primary font-mono shrink-0">3.</span>Sign in and you're good to go</li>
              </ol>
              <div className="pt-2 border-t text-xs text-muted-foreground leading-relaxed">
                Once your account is active, you can request access to the Intelligence Observatory from the homepage.
              </div>
            </>
          )}
        </div>

        {/* Spam note */}
        <div className="rounded-lg bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
          Can't find the email? Check your spam or junk folder. It usually arrives within a minute.
        </div>

        <button
          onClick={() => navigate("/login")}
          className="w-full rounded-lg border px-4 py-2.5 text-sm hover:bg-muted transition text-center"
        >
          Back to sign in
        </button>

      </div>
    </div>
  )
}
