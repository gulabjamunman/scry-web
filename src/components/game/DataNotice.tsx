/**
 * src/components/game/DataNotice.tsx
 *
 * Disclaimer shown once per browser (on first game session ever).
 * Explains data collection and the 3-play-per-day limit for anonymous users.
 *
 * Usage:
 * if (!hasSeenDataNotice()) {
 *   return <DataNotice onAccept={() => setShowDisclaimer(false)} />
 * }
 */

import { AlertCircle } from 'lucide-react'
import { markDataNoticeSeen } from '@/lib/reader-identity'

interface Props {
  onAccept: () => void
}

export function DataNotice({ onAccept }: Props) {
  function handleAccept() {
    markDataNoticeSeen()
    onAccept()
  }

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-2 flex-1">
          <p className="text-xs font-mono tracking-widest uppercase text-amber-700 dark:text-amber-300 font-medium">
            Before you play
          </p>
          <div className="space-y-3 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
            <p>
              Your answers contribute to <strong>SCRY's public research</strong> on how Indian readers perceive:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Framing bias in news coverage</li>
              <li>Editorial silence and omissions</li>
              <li>Language intensity and emotional charge</li>
            </ul>
            <p>
              No personally identifying information is inferred or stored. Your session is linked to an anonymous ID that
              survives across sessions on this browser.
            </p>
            <p className="text-xs pt-2">
              <strong>Unregistered readers:</strong> Play up to <strong>3 briefs per day</strong>. Creating a free
              account removes this limit and builds your personal reader profile.
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={handleAccept}
        className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white text-sm font-semibold transition"
      >
        Got it — start today's brief
      </button>

      <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
        We use this data to fine-tune models of how Indian readers understand news, detect sentiment, and evaluate
        credibility. You help make better tools for everyone.
      </p>
    </div>
  )
}
