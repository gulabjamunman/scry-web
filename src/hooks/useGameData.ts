/**
 * src/hooks/useGameData.ts
 *
 * Fetches game round data from Supabase:
 * - Top 4 active clusters (for Round 0 — Signal Scan)
 * - Articles from top cluster (for Round 1 — Headline Match)
 * - Publisher silence data (for Round 2 — Who Went Silent)
 * - Publisher scatter data (for Round 3 — Outlier Scatter)
 * - Community stats (for Round 4 — The Verdict)
 *
 * Returns complete GameData object with correct answers + scoring info.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// ============================================================================
// Type Definitions
// ============================================================================

export interface GameRound0Story {
  id: string
  topic: string
  title: string
  publisherCount: number
  silentCount: number
}

export interface GameRound1Headline {
  id: string
  headline: string
  publisherName: string
  aiFramingDirection: number
}

export interface GameRound3Dot {
  publisher: string
  framing: number
  intensity: number
}

export interface GameData {
  clusterId: string
  clusterTitle: string
  clusterTopic: string

  // Round 0 — Signal Scan (4 clusters, identify the one with most silence)
  stories: GameRound0Story[]
  correctStoryIndex: number

  // Round 1 — Headline Match (3 articles from top cluster, identify most right-leaning)
  headlines: GameRound1Headline[]
  correctHeadlineIndex: number

  // Round 2 — Who Went Silent (select publishers who didn't cover)
  allPublishers: string[]
  silentPublishers: string[]

  // Round 3 — Scatter Outlier (identify publisher with extreme framing + intensity)
  scatterDots: GameRound3Dot[]
  outlierPublisher: string
  outlierIndex: number

  // Round 4 — The Verdict (average stats + community sentiment)
  avgFraming: number
  avgIntensity: number
  avgFactRatio: number
  avgThreatSignal: number
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGameData() {
  const [data, setData] = useState<GameData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadGameData()
  }, [])

  async function loadGameData() {
    try {
      setLoading(true)
      setError(null)

      // Fetch top 4 active clusters (last 24 hours)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { data: clusters, error: clustersError } = await supabase
        .from('story_clusters')
        .select(
          `id, title, dominant_topic, publisher_count, silent_count,
           publishers_silent, avg_framing_direction, avg_language_intensity,
           avg_fact_ratio, avg_threat_signal`
        )
        .eq('is_active', true)
        .gte('last_seen', cutoff)
        .order('publisher_count', { ascending: false })
        .limit(4)

      if (clustersError) throw clustersError
      if (!clusters || clusters.length < 2) {
        throw new Error('Not enough active stories for today. Please check back later.')
      }

      // Round 0 — Stories (clusters)
      const stories: GameRound0Story[] = clusters.map(c => ({
        id: c.id,
        topic: c.dominant_topic ?? 'News',
        title: c.title,
        publisherCount: c.publisher_count ?? 0,
        silentCount: c.silent_count ?? 0,
      }))

      // Correct answer = cluster with max silence
      const correctStoryIndex = stories.reduce(
        (maxI, s, i, arr) => (s.silentCount > arr[maxI].silentCount ? i : maxI),
        0
      )

      // Top cluster drives rounds 1-4
      const topCluster = clusters[0]

      // ========================================================================
      // Round 1 — Headline Match (3 articles with max framing spread)
      // ========================================================================

      const { data: allArticles, error: articlesError } = await supabase
        .from('articles')
        .select('id, headline, publisher_name, ai_framing_direction')
        .not('ai_framing_direction', 'is', null)
        .eq('story_cluster_id', topCluster.id)
        .order('ai_framing_direction', { ascending: false })
        .limit(100)

      if (articlesError) throw articlesError

      const validArticles = (allArticles ?? []).filter(a => a.ai_framing_direction != null)

      if (validArticles.length < 3) {
        throw new Error('Not enough articles for today. Please try again.')
      }

      // Pick rightmost, leftmost, and neutral
      const rightmost = validArticles[0]
      const leftmost = validArticles[validArticles.length - 1]

      // Find neutral from different publisher
      const neutralCandidate = validArticles.find(
        a =>
          Math.abs(a.ai_framing_direction) < 0.3 &&
          a.publisher_name !== rightmost.publisher_name &&
          a.publisher_name !== leftmost.publisher_name
      )
      const neutral = neutralCandidate || validArticles[Math.floor(validArticles.length / 2)]

      // Shuffle into random order
      const headlinePool = [rightmost, neutral, leftmost]
      const shuffledHeadlines = headlinePool.sort(() => Math.random() - 0.5)
      const headlines: GameRound1Headline[] = shuffledHeadlines.map(a => ({
        id: a.id,
        headline: a.headline,
        publisherName: a.publisher_name,
        aiFramingDirection: a.ai_framing_direction,
      }))

      // Correct = rightmost (most right-leaning)
      const correctHeadlineIndex = headlines.findIndex(h => h.id === rightmost.id)

      // ========================================================================
      // Round 2 — Who Went Silent
      // ========================================================================

      const allTrackedPublishers = [
        'ANI',
        'Hindustan Times',
        'India Today',
        'Indian Express',
        'NDTV',
        'News18',
        'The Hindu',
        'The Quint',
        'Times of India',
        'BBC India',
        'DW Asia',
        'India TV News',
        'Scroll.in',
        'National Herald',
        'Newslaundry',
        'OpIndia',
        'Swarajya Mag',
      ]

      const silentPublishers: string[] = topCluster.publishers_silent ?? []
      const coveredPublishers = allTrackedPublishers.filter(p => !silentPublishers.includes(p))
      const allPublishers = [...coveredPublishers, ...silentPublishers].sort(() => Math.random() - 0.5)

      // ========================================================================
      // Round 3 — Outlier Scatter
      // ========================================================================

      const { data: clusterArticles, error: clusterArticlesError } = await supabase
        .from('articles')
        .select('publisher_name, ai_framing_direction, ai_language_intensity')
        .eq('story_cluster_id', topCluster.id)
        .not('ai_framing_direction', 'is', null)
        .not('ai_language_intensity', 'is', null)
        .limit(500)

      if (clusterArticlesError) throw clusterArticlesError

      // Average per publisher
      const pubMap: Record<string, { framing: number[]; intensity: number[] }> = {}
      ;(clusterArticles ?? []).forEach(a => {
        if (!pubMap[a.publisher_name]) pubMap[a.publisher_name] = { framing: [], intensity: [] }
        pubMap[a.publisher_name].framing.push(a.ai_framing_direction)
        pubMap[a.publisher_name].intensity.push(a.ai_language_intensity)
      })

      const scatterDots: GameRound3Dot[] = Object.entries(pubMap)
        .map(([publisher, v]) => ({
          publisher,
          framing: v.framing.reduce((a, b) => a + b, 0) / v.framing.length,
          intensity: v.intensity.reduce((a, b) => a + b, 0) / v.intensity.length,
        }))
        .filter(d => Math.abs(d.framing) > 0.05 || d.intensity > 0.3)
        .slice(0, 8)

      if (scatterDots.length === 0) {
        throw new Error('Not enough data for scatter visualization. Please try again.')
      }

      // Outlier = highest combined framing + intensity
      const outlierIndex = scatterDots.reduce(
        (maxI, d, i, arr) =>
          Math.abs(d.framing) + d.intensity > Math.abs(arr[maxI].framing) + arr[maxI].intensity ? i : maxI,
        0
      )
      const outlierPublisher = scatterDots[outlierIndex].publisher

      // ========================================================================
      // Build final data object
      // ========================================================================

      const gameData: GameData = {
        clusterId: topCluster.id,
        clusterTitle: topCluster.title,
        clusterTopic: topCluster.dominant_topic ?? 'News',
        stories,
        correctStoryIndex,
        headlines,
        correctHeadlineIndex,
        allPublishers,
        silentPublishers,
        scatterDots,
        outlierPublisher,
        outlierIndex,
        avgFraming: topCluster.avg_framing_direction ?? 0,
        avgIntensity: topCluster.avg_language_intensity ?? 0,
        avgFactRatio: topCluster.avg_fact_ratio ?? 0,
        avgThreatSignal: topCluster.avg_threat_signal ?? 0,
      }

      setData(gameData)
    } catch (err: any) {
      console.error('Game data load error:', err)
      setError(err.message || 'Failed to load today\'s brief. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error }
}
