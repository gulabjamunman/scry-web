import { useNavigate } from "react-router-dom"
import { CheckCircle, ArrowRight } from "lucide-react"

export default function EmailConfirmedPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-card shadow-sm">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight">Account confirmed</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account is now active. Here's what you can do.
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm divide-y">
          {[
            {
              title:   "Browse the platform",
              desc:    "Article Explorer, Insights, and Transparency are all open to you right away.",
              action:  () => navigate("/"),
              label:   "Go to home",
              primary: true,
            },
            {
              title:   "Request Intelligence access",
              desc:    "The Observatory requires early access approval. Request it from the homepage.",
              action:  () => navigate("/"),
              label:   "Request access",
              primary: false,
            },
            {
              title:   "Become a reviewer",
              desc:    "Help calibrate the platform by scoring articles. Open to all accounts.",
              action:  () => navigate("/reviewer"),
              label:   "Start reviewing",
              primary: false,
            },
          ].map(item => (
            <div key={item.title} className="p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
              <button
                onClick={item.action}
                className={`shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                  item.primary
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border hover:bg-muted text-foreground"
                }`}
              >
                {item.label}
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
