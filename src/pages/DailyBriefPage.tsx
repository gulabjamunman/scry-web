// EXACT FILE — NO MODIFICATIONS BEYOND REQUIRED STRUCTURE FIX

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, SkipForward } from 'lucide-react'
import { useGameData } from '@/hooks/useGameData'
import { useGameSession } from '@/hooks/useGameSession'
import { getPlayCountToday, ANON_LIMIT, hasSeenDataNotice } from '@/lib/reader-identity'
import { getTodaysCommunityStats, getReaderProfile } from '@/lib/game-api'
import { DataNotice } from '@/components/game/DataNotice'
import { RegistrationGate } from '@/components/game/RegistrationGate'

type GamePhase = 'q' | 'r'
type GameRound = 0 | 1 | 2 | 3 | 4

export default function DailyBriefPage() {
  const navigate = useNavigate()

  const [round, setRound] = useState<GameRound>(0)
  const [phase, setPhase] = useState<GamePhase>('q')
  const [scores, setScores] = useState<Record<string, number>>({})
  const [showDisclaimer, setShowDisclaimer] = useState(!hasSeenDataNotice())

  const { data, loading, error } = useGameData()
  const game = useGameSession(data?.clusterId ?? '')

  const [isRegistered, setIsRegistered] = useState(false)
  const [playedToday] = useState(getPlayCountToday())

  const [communityStats, setCommunityStats] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [gameComplete, setGameComplete] = useState(false)

  useEffect(() => {
    getReaderProfile().then(p => setIsRegistered(!!p)).catch(() => {})
  }, [])

  if (showDisclaimer) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <DataNotice onAccept={() => setShowDisclaimer(false)} />
      </div>
    )
  }

  if (!isRegistered && playedToday >= ANON_LIMIT) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">Daily limit reached</h1>
        <p className="text-muted-foreground">Unregistered readers can play 3 briefs per day.</p>
        <button onClick={() => navigate('/login')} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold">
          Sign in to play more
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-10">Loading today's brief...</div>
  }

  if (error || !data) {
    return <div className="text-center py-10">Error loading</div>
  }

  // ================= ROUNDS =================

  if (round === 0) {
    return (
      <Round0SignalScan
        data={data}
        phase={phase}
        game={game}
        onAnswer={(i: number) => {
          const correct = i === data.correctStoryIndex ? 3 : 0
          setScores(p => ({ ...p, r0: correct }))
          setPhase('r')
        }}
        onNext={() => {
          setRound(1)
          setPhase('q')
          game.startRound('r1')
        }}
      />
    )
  }

  if (round === 1) {
    return (
      <Round1HeadlineMatch
        data={data}
        phase={phase}
        game={game}
        onAnswer={(i: number) => {
          const correct = i === data.correctHeadlineIndex ? 3 : 0
          setScores(p => ({ ...p, r1: correct }))
          setPhase('r')
        }}
        onNext={() => {
          setRound(2)
          setPhase('q')
          game.startRound('r2')
        }}
        platformLink={
          <button onClick={() => navigate(`/cluster/${data.clusterId}#coverage-map`)} className="text-xs text-primary">
            See the full silence map <ArrowRight className="h-3 w-3 inline" />
          </button>
        }
      />
    )
  }

  if (round === 2) {
    return (
      <Round2WhoWentSilent
        data={data}
        phase={phase}
        game={game}
        onAnswer={(selected: string[]) => {
          const correct = selected.filter(p => data.silentPublishers.includes(p)).length
          setScores(p => ({ ...p, r2: Math.min(correct, 3) }))
          setPhase('r')
        }}
        onNext={() => {
          setRound(3)
          setPhase('q')
          game.startRound('r3')
        }}
      />
    )
  }

  if (round === 3) {
    return (
      <Round3OutlierScatter
        data={data}
        phase={phase}
        game={game}
        onAnswer={(publisher: string) => {
          const correct = publisher === data.outlierPublisher ? 3 : 0
          setScores(p => ({ ...p, r3: correct }))
          setPhase('r')
        }}
        onNext={() => {
          setRound(4)
          setPhase('q')
          game.startRound('r4')
        }}
      />
    )
  }

  if (round === 4) {
    return (
      <Round4TheVerdict
        data={data}
        phase={phase}
        game={game}
        onAnswer={() => {
          setScores(p => ({ ...p, r4: 3 }))
          setPhase('r')
        }}
        onComplete={async () => {
          const total = Object.values(scores).reduce((a, b) => a + b, 0) + 3
          await game.saveSession({ ...scores, r4: 3 }, total)

          const stats = await getTodaysCommunityStats(data.clusterId)
          const prof = await getReaderProfile()

          setCommunityStats(stats)
          setProfile(prof)
          setGameComplete(true)
        }}
      />
    )
  }

  if (gameComplete) {
    const total = Object.values(scores).reduce((a, b) => a + b, 0)

    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
        <div className="text-center text-4xl font-bold">{total}/15</div>

        <div className="flex gap-2">
          <button onClick={() => navigate('/')}>Home</button>
          <button onClick={() => navigate('/brief')}>
            <SkipForward className="h-4 w-4 inline" /> Next
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ============================================================================
// ROUND COMPONENTS — Replace with your existing widget UI
// ============================================================================
 
// These are TEMPLATES. Copy your existing widget round components here
// and swap the data sources.
 
interface RoundProps {
  data: any
  phase: GamePhase
  game: any
  onAnswer: (answer: any) => void
  onNext: () => void
  platformLink?: React.ReactNode
  onComplete?: () => void
}
 
function Round0SignalScan({ data, phase, game, onAnswer, onNext }: RoundProps) {
  const [selected, setSelected] = useState<number | null>(null)
 
  if (!data) return null
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      {phase === 'q' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Round 1 of 5</p>
            <h1 className="text-2xl font-bold">Signal Scan</h1>
            <p className="text-sm text-muted-foreground">
              Which of these stories had the biggest coverage gap — which outlets stayed silent?
            </p>
          </div>
 
          <div className="space-y-2">
            {data.stories.map((story: any, idx: number) => (
              <button
                key={story.id}
                onClick={() => {
                  setSelected(idx)
                  game.recordAnswer('r0', { storyIndex: idx })
                  onAnswer(idx)
                }}
                className={`w-full p-4 rounded-lg border text-left transition ${
                  selected === idx
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">{story.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {story.publisherCount} publishers · {story.silentCount} stayed silent
                </p>
              </button>
            ))}
          </div>
        </>
      )}
 
      {phase === 'r' && (
        <>
          <div className="space-y-4">
            <p className="text-sm font-semibold">The answer</p>
            <p className="text-sm text-muted-foreground">
              {data.stories[data.correctStoryIndex].title} had the biggest silence gap —{' '}
              {data.stories[data.correctStoryIndex].silentCount} outlets didn't cover it at all.
            </p>
          </div>
          <button
            onClick={onNext}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            Next round
          </button>
        </>
      )}
    </div>
  )
}
 
function Round1HeadlineMatch({ data, phase, game, onAnswer, onNext, platformLink }: RoundProps) {
  const [selected, setSelected] = useState<number | null>(null)
 
  if (!data) return null
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      {phase === 'q' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Round 2 of 5</p>
            <h1 className="text-2xl font-bold">Headline Match</h1>
            <p className="text-sm text-muted-foreground">
              Three outlets covered the same story. Which headline leans most right?
            </p>
          </div>
 
          <div className="space-y-2">
            {data.headlines.map((headline: any, idx: number) => (
              <button
                key={headline.id}
                onClick={() => {
                  setSelected(idx)
                  game.recordAnswer('r1', { headlineIndex: idx })
                  onAnswer(idx)
                }}
                className={`w-full p-4 rounded-lg border text-left transition ${
                  selected === idx
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold text-sm leading-snug">{headline.headline}</p>
                <p className="text-xs text-muted-foreground mt-2">{headline.publisherName}</p>
              </button>
            ))}
          </div>
        </>
      )}
 
      {phase === 'r' && (
        <>
          <div className="space-y-4">
            <p className="text-sm font-semibold">The answer</p>
            <p className="text-sm text-muted-foreground">
              "{data.headlines[data.correctHeadlineIndex].headline}"
            </p>
            <p className="text-xs text-muted-foreground">
              — {data.headlines[data.correctHeadlineIndex].publisherName}
            </p>
            {platformLink}
          </div>
          <button
            onClick={onNext}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition mt-4"
          >
            Next round
          </button>
        </>
      )}
    </div>
  )
}
 
function Round2WhoWentSilent({ data, phase, game, onAnswer, onNext }: RoundProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
 
  if (!data) return null
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      {phase === 'q' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Round 3 of 5</p>
            <h1 className="text-2xl font-bold">Who Went Silent</h1>
            <p className="text-sm text-muted-foreground">
              Which of these outlets didn't cover this story at all?
            </p>
          </div>
 
          <div className="grid grid-cols-2 gap-2">
            {data.allPublishers.map((publisher: string) => (
              <button
                key={publisher}
                onClick={() => {
                  const newSelected = new Set(selected)
                  if (newSelected.has(publisher)) {
                    newSelected.delete(publisher)
                  } else {
                    newSelected.add(publisher)
                  }
                  setSelected(newSelected)
                  game.recordAnswer('r2', { selectedPublishers: Array.from(newSelected) })
                }}
                className={`p-3 rounded-lg border text-left transition text-xs font-medium ${
                  selected.has(publisher)
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {publisher}
              </button>
            ))}
          </div>
 
          <button
            onClick={() => onAnswer(Array.from(selected))}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition"
          >
            Submit answer
          </button>
        </>
      )}
 
      {phase === 'r' && (
        <>
          <div className="space-y-4">
            <p className="text-sm font-semibold">Who didn't cover this story</p>
            <div className="grid grid-cols-2 gap-2">
              {data.silentPublishers.map((pub: string) => (
                <div key={pub} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs font-medium">
                  {pub}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onNext}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition mt-4"
          >
            Next round
          </button>
        </>
      )}
    </div>
  )
}
 
function Round3OutlierScatter({ data, phase, game, onAnswer, onNext }: RoundProps) {
  const [selected, setSelected] = useState<string | null>(null)
 
  if (!data) return null
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      {phase === 'q' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Round 4 of 5</p>
            <h1 className="text-2xl font-bold">The Outlier</h1>
            <p className="text-sm text-muted-foreground">
              Which outlet's coverage was most extreme on both framing and language intensity?
            </p>
          </div>
 
          <div className="space-y-2">
            {data.scatterDots.map((dot: any) => (
              <button
                key={dot.publisher}
                onClick={() => {
                  setSelected(dot.publisher)
                  game.recordAnswer('r3', { publisherName: dot.publisher })
                  onAnswer(dot.publisher)
                }}
                className={`w-full p-4 rounded-lg border text-left transition ${
                  selected === dot.publisher
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">{dot.publisher}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Framing: {(dot.framing * 100).toFixed(0)}% · Intensity: {(dot.intensity * 100).toFixed(0)}%
                </p>
              </button>
            ))}
          </div>
        </>
      )}
 
      {phase === 'r' && (
        <>
          <div className="space-y-4">
            <p className="text-sm font-semibold">The outlier</p>
            <p className="text-sm text-muted-foreground">{data.outlierPublisher}</p>
          </div>
          <button
            onClick={onNext}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition mt-4"
          >
            Final round
          </button>
        </>
      )}
    </div>
  )
}
 
function Round4TheVerdict({ data, phase, game, onAnswer, onComplete }: RoundProps) {
  const [gap, setGap] = useState<string | null>(null)
  const [trust, setTrust] = useState<string | null>(null)
 
  if (!data) return null
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      {phase === 'q' && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Round 5 of 5</p>
            <h1 className="text-2xl font-bold">The Verdict</h1>
            <p className="text-sm text-muted-foreground">
              Synthesize what you've seen. What's your call on the framing?
            </p>
          </div>
 
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-2">Gap between outlets</p>
              <div className="space-y-2">
                {['negligible', 'moderate', 'severe'].map(option => (
                  <button
                    key={option}
                    onClick={() => setGap(option)}
                    className={`w-full p-3 rounded-lg border text-left transition text-sm ${
                      gap === option
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
 
            <div>
              <p className="text-sm font-semibold mb-2">Trust the coverage?</p>
              <div className="space-y-2">
                {['yes', 'uncertain', 'no'].map(option => (
                  <button
                    key={option}
                    onClick={() => setTrust(option)}
                    className={`w-full p-3 rounded-lg border text-left transition text-sm ${
                      trust === option
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
 
          <button
            onClick={() => {
              if (gap && trust) {
                game.recordAnswer('r4', { gap, trust })
                onAnswer({ gap, trust })
              }
            }}
            disabled={!gap || !trust}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </>
      )}
 
      {phase === 'r' && (
        <>
          <div className="space-y-4">
            <p className="text-sm font-semibold">Your verdict</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-card border">
                <p className="text-xs text-muted-foreground">Gap</p>
                <p className="font-semibold text-sm capitalize mt-1">{gap}</p>
              </div>
              <div className="p-3 rounded-lg bg-card border">
                <p className="text-xs text-muted-foreground">Trust</p>
                <p className="font-semibold text-sm capitalize mt-1">{trust}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onComplete}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition mt-4"
          >
            See your score
          </button>
        </>
      )}
    </div>
  )
}
 
