/**
 * src/components/game/DailyBriefEntry.tsx
 *
 * Displayed on homepage. Shows "Daily Brief" button if not played today,
 * or "Complete" status if already played.
 *
 * Usage:
 * <DailyBriefEntry onClick={() => navigate("/brief")} />
 */

import { useEffect, useState } from 'react'
import { Zap, ArrowRight } from 'lucide-react'
import { hasPlayedToday } from '@/lib/game-api'

interface Props {
  onClick: () => void
}

export function DailyBriefEntry({ onClick }: Props) {
  const [played, setPlayed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const played = await hasPlayedToday()
      setPlayed(played)
      setLoading(false)
    }
    check()
  }, [])

  if (loading) {
    return null // Don't flash; just hide until we know
  }

  return (
    <div
      onClick={!played ? onClick : undefined}
      className={`rounded-xl border p-5 flex items-center justify-between gap-4 transition-all
        ${
          played
            ? 'bg-muted/30 border-border cursor-default opacity-70'
            : 'bg-primary/5 border-primary/20 hover:bg-primary/10 cursor-pointer group'
        }`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-mono tracking-widest uppercase text-primary font-medium">
            Daily Brief
          </span>
          {!played && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium">
              New today
            </span>
          )}
        </div>
        <p className="text-sm font-semibold">
          {played ? 'Brief complete — come back tomorrow' : "Test your read on today's top story"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {played
            ? 'Your answers have been recorded. Thank you for helping us understand how Indian readers perceive news.'
            : '5 rounds · framing, silence, and editorial judgment · ~3 min'}
        </p>
      </div>
      {!played && (
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
      )}
    </div>
  )
}
