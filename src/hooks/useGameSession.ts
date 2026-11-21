/**
 * src/hooks/useGameSession.ts
 *
 * Tracks per-round timing and answer changes during gameplay.
 * Saves complete session with behavioral data to Supabase.
 */

import { useRef, useState } from 'react'
import { getAnonId } from '@/lib/reader-identity'
import { saveGameSession, SessionPayload } from '@/lib/game-api'

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGameSession(clusterId: string) {
  const anonId = useRef(getAnonId())
  const roundStart = useRef<number>(Date.now())
  const timings = useRef<Record<string, number>>({})
  const changes = useRef<Record<string, number>>({})
  const reveals = useRef<Record<string, boolean>>({})
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [isSaving, setIsSaving] = useState(false)

  /**
   * Call at the start of each round to begin timing.
   * roundKey should be 'r0', 'r1', etc.
   */
  function startRound(roundKey: string) {
    roundStart.current = Date.now()
    // Initialize change counter if needed
    if (!(roundKey in changes.current)) {
      changes.current[roundKey] = 0
    }
  }

  /**
   * Call when user modifies their answer before submitting.
   * Increments the change counter for this round.
   */
  function recordChange(roundKey: string) {
    changes.current[roundKey] = (changes.current[roundKey] ?? 0) + 1
  }

  /**
   * Call when user submits an answer.
   * Records elapsed time and stores the answer.
   */
  function recordAnswer(roundKey: string, answer: any) {
    const elapsed = Date.now() - roundStart.current
    timings.current[roundKey] = elapsed

    setAnswers(prev => ({
      ...prev,
      [roundKey]: answer,
    }))
  }

  /**
   * Call when user views the reveal for a round.
   * Tracks engagement with reveal content (used for later analysis).
   */
  function recordReveal(roundKey: string, engaged: boolean = true) {
    reveals.current[roundKey] = engaged
  }

  /**
   * Save the complete session to Supabase.
   * Call this when the game is complete.
   *
   * @param scores - Object with r0, r1, r2, r3, r4 scores
   * @param totalScore - Sum of all round scores
   * @returns session ID if successful, null if failed
   */
  async function saveSession(
    scores: Record<string, number>,
    totalScore: number
  ): Promise<string | null> {
    setIsSaving(true)

    try {
      const payload: SessionPayload = {
        clusterId,
        answers,
        scores,
        totalScore,
        roundTimingsMs: timings.current,
        answerChanges: changes.current,
        revealsEngaged: reveals.current,
      }

      const sessionId = await saveGameSession(payload)
      return sessionId
    } catch (error) {
      console.error('Failed to save session:', error)
      return null
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Get timing data (useful for debugging/analysis).
   */
  function getTimings() {
    return { ...timings.current }
  }

  /**
   * Get answer change counts (useful for debugging/analysis).
   */
  function getChanges() {
    return { ...changes.current }
  }

  /**
   * Reset all session data (useful for new game or testing).
   */
  function reset() {
    timings.current = {}
    changes.current = {}
    reveals.current = {}
    setAnswers({})
  }

  return {
    startRound,
    recordChange,
    recordAnswer,
    recordReveal,
    saveSession,
    getTimings,
    getChanges,
    reset,
    isSaving,
    answers,
  }
}
