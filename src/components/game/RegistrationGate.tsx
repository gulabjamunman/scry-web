/**
 * src/components/game/RegistrationGate.tsx
 *
 * Displayed on final screen after 3rd anonymous session.
 * Prompts user to register to keep playing and build persistent profile.
 *
 * Usage:
 * if (isAnonUser && playCount === 3) {
 *   return <RegistrationGate totalScore={score} readerType={type} sessionCount={3} />
 * }
 */

import { useNavigate } from 'react-router-dom'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { getAnonId } from '@/lib/reader-identity'

interface Props {
  totalScore: number
  readerType?: string | null
  sessionCount: number
  clusterTitle?: string
}

export function RegistrationGate({ totalScore, readerType, sessionCount, clusterTitle }: Props) {
  const navigate = useNavigate()
  const anonId = getAnonId()

  return (
    <div className="space-y-4 mt-6">
      {/* Main card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-mono tracking-widest uppercase text-primary font-medium">
            Your reading profile is forming
          </p>
          <p className="text-base font-semibold">
            You've completed {sessionCount} brief{sessionCount !== 1 ? 's' : ''}.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            After {sessionCount} session{sessionCount !== 1 ? 's' : ''}, we can already see patterns in how you read:
            your framing accuracy, how well you spot silence, which outlets you understand. Registering saves this
            history and shows how you evolve.
          </p>
        </div>

        {/* Stats preview */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-background border p-3 text-center">
            <div className="text-base font-semibold font-mono text-primary">{sessionCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Played</div>
          </div>
          <div className="rounded-lg bg-background border p-3 text-center">
            <div className="text-base font-semibold font-mono text-primary">
              {totalScore}
              <span className="text-xs font-normal">/15</span>
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Latest</div>
          </div>
          <div className="rounded-lg bg-background border p-3 text-center">
            <div className="text-base font-semibold font-mono text-primary">{readerType ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">Type</div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate(`/signup?anon=${anonId}&ref=brief`)}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            Save my profile — it's free
          </button>
          <button
            onClick={() => navigate(`/login?anon=${anonId}&ref=brief`)}
            className="w-full py-2.5 rounded-lg border text-sm font-medium text-muted-foreground hover:text-foreground transition"
          >
            I already have an account
          </button>
        </div>

        {/* Info text */}
        <p className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t">
          Your answers contribute anonymously to SCRY's research on how Indian readers perceive news — regardless of
          whether you register. Registration only affects your personal profile.
        </p>
      </div>

      {/* Post-registration CTA */}
      {clusterTitle && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-2">While you register, explore:</p>
          <button
            onClick={() => navigate(`/cluster/${clusterTitle}`)}
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            Full analysis <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
