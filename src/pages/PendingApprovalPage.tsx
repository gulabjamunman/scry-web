import { useNavigate } from "react-router-dom"
import { Clock, Mail, ArrowLeft, CheckCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"

export default function PendingApprovalPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">

        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full border bg-muted p-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Access request received
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {user?.email
              ? <>Your account <span className="font-medium text-foreground">{user.email}</span> is pending approval.</>
              : "Your account is pending approval."
            }
            {" "}We review requests manually and will reach out via email once you're approved.
          </p>
        </div>

        {/* What happens next */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            What happens next
          </p>
          <div className="space-y-3">
            {[
              {
                icon: CheckCircle,
                title: "Your request is in the queue",
                desc:  "We review all access requests personally.",
              },
              {
                icon: Mail,
                title: "You'll receive an email from hello@scry.in",
                desc:  "Once approved, you'll get a confirmation. No action needed until then.",
              },
              {
                icon: CheckCircle,
                title: "Log back in to access the Observatory",
                desc:  "After approval your account will automatically have full access.",
              },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <step.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* While you wait */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Available while you wait
          </p>
          <div className="space-y-2">
            {[
              { label: "Article Explorer",  url: "/explorer",      desc: "Browse all analyzed articles" },
              { label: "Ideological Map",   url: "/map",           desc: "See framing patterns visually" },
              { label: "Transparency",      url: "/transparency",  desc: "Read our full methodology" },
            ].map(item => (
              <button
                key={item.url}
                onClick={() => navigate(item.url)}
                className="w-full flex items-center justify-between rounded-lg border px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </button>

      </div>
    </div>
  )
}
