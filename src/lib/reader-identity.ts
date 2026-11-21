/**
 * src/lib/reader-identity.ts
 *
 * Generates stable anonymous IDs for unregistered users.
 * Tracks daily play count for the 3-play-per-day limit.
 * Links anon sessions to user account on registration.
 */

export const ANON_LIMIT = 3

/**
 * Generate or retrieve a stable anonymous ID for this browser.
 * Persists across sessions using localStorage.
 * When user registers, this ID is used to link their history.
 */
export function getAnonId(): string {
  const key = 'scry-anon-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

/**
 * Get the number of briefs played today (for anon users).
 * Resets daily based on calendar date.
 */
export function getPlayCountToday(): number {
  const key = 'scry-plays-' + new Date().toISOString().split('T')[0]
  return parseInt(localStorage.getItem(key) ?? '0', 10)
}

/**
 * Increment the play count after session save.
 * Call this after saveGameSession() completes successfully.
 */
export function incrementPlayCount(): void {
  const key = 'scry-plays-' + new Date().toISOString().split('T')[0]
  const n = getPlayCountToday() + 1
  localStorage.setItem(key, String(n))
}

/**
 * Check if a data notice was ever shown to this browser.
 * Used to show the disclaimer only once.
 */
export function hasSeenDataNotice(): boolean {
  return localStorage.getItem('scry-notice-seen') === '1'
}

/**
 * Mark the data notice as seen.
 */
export function markDataNoticeSeen(): void {
  localStorage.setItem('scry-notice-seen', '1')
}

/**
 * Reset play count (useful for testing or admin purposes).
 */
export function resetPlayCount(): void {
  const key = 'scry-plays-' + new Date().toISOString().split('T')[0]
  localStorage.removeItem(key)
}

/**
 * Clear all SCRY-related localStorage (debugging tool).
 */
export function clearAllScryData(): void {
  const keys = Object.keys(localStorage).filter(k => k.includes('scry-'))
  keys.forEach(k => localStorage.removeItem(k))
  console.log(`Cleared ${keys.length} SCRY localStorage keys`)
}
