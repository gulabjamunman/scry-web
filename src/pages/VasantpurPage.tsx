import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { fetchTodayVasantpurScenario, fetchVasantpurScenarioBySlug } from "@/lib/vasantpur-api"
import {
  createGameSession,
  logDecision,
  patchGameSession,
  completeGameSession,
  getTodaysCommunityStats,
} from "@/lib/game-api"
import { getAnonId } from "@/lib/reader-identity"
import { track } from "@/lib/analytics"
import type { GameScenarioRow } from "@/lib/vasantpur-types"

const IFRAME_SRC = "/games/vasantpur.html"

export default function VasantpurPage() {
  const [searchParams]                = useSearchParams()
  const iframeRef                     = useRef<HTMLIFrameElement | null>(null)
  const [scenarioRow, setScenarioRow] = useState<GameScenarioRow | null>(null)
  const sessionIdRef                  = useRef<string | null>(null)

  // ── Load scenario ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    ;(async () => {
      const requestedSlug = searchParams.get("slug")
      const row = requestedSlug
        ? await fetchVasantpurScenarioBySlug(requestedSlug)
        : await fetchTodayVasantpurScenario()

      if (mounted && row) {
        setScenarioRow(row)
      }
    })()

    return () => {
      mounted = false
    }
  }, [searchParams])

  // ── Post scenario to iframe ────────────────────────────────────
  const postScenarioToGame = useCallback(() => {
    if (!scenarioRow?.payload || !iframeRef.current?.contentWindow) return

    // Use '*' as target origin — iframe origin may be 'null' in some
    // environments. Safe here because the payload is not sensitive.
    iframeRef.current.contentWindow.postMessage(
      { type: "vasantpur:setScenario", payload: scenarioRow.payload },
      "*"
    )

    track("vasantpur_scenario_loaded", {
      scenario_slug:  scenarioRow.slug,
      scenario_title: scenarioRow.title,
      scenario_date:  scenarioRow.scenario_date,
    })
  }, [scenarioRow])

  useEffect(() => {
    postScenarioToGame()
  }, [postScenarioToGame])

  // ── Handle postMessage events from iframe ──────────────────────
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      // Accept from any origin — filter by message type instead
      if (!event.data?.type) return

      const msg = event.data

      switch (msg.type) {

        case "vasantpur:ready": {
          // Game iframe has loaded and is ready — send scenario
          postScenarioToGame()
          break
        }

        case "vasantpur:log": {
          const p = msg.payload || {}

          // Create session row on first init signal
          if (p.event === "session_init" && !sessionIdRef.current) {
            const sessionId = await createGameSession({
              clusterId:    scenarioRow?.story_cluster_id ?? null,
              scenarioId:   scenarioRow?.id ?? null,
              clusterTopic: p.clusterTopic ?? null,
              persona:      "meera",
              platform:     /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "web",
            })
            sessionIdRef.current = sessionId

            track("vasantpur_session_start", {
              scenario_slug: scenarioRow?.slug,
              session_id:    sessionId,
            })
          }

          // Patch session answers/scores incrementally
          if (p.event === "session_patch" && sessionIdRef.current) {
            patchGameSession(sessionIdRef.current, {
              answers:         p.answers,
              scores:          p.scores,
              answer_changes:  p.answer_changes,
              reveals_engaged: p.reveals_engaged,
            })
          }

          // Forward all log events to analytics
          track("vasantpur_event", {
            ...p,
            scenario_slug: scenarioRow?.slug,
            session_id:    sessionIdRef.current,
          })
          break
        }

        case "vasantpur:decision": {
          if (!sessionIdRef.current) break
          const row = {
            ...msg.payload,
            session_id:  sessionIdRef.current,
            scenario_id: scenarioRow?.id ?? msg.payload.scenario_id,
            cluster_id:  scenarioRow?.story_cluster_id ?? msg.payload.cluster_id,
            anon_id:     getAnonId(),
          }
          await logDecision(row)
          track("vasantpur_decision", {
            round_type:     msg.payload.round_type,
            behavioral_dim: msg.payload.behavioral_dim,
            scenario_slug:  scenarioRow?.slug,
            session_id:     sessionIdRef.current,
          })
          break
        }

        case "vasantpur:beatComplete": {
          if (!sessionIdRef.current) break
          const { beat, timingMs } = msg.payload
          patchGameSession(sessionIdRef.current, {
            round_timings_ms: { [`b${beat}`]: timingMs },
          })
          break
        }

        case "vasantpur:scryEngaged": {
          if (!sessionIdRef.current) break
          patchGameSession(sessionIdRef.current, {
            reveals_engaged: { [msg.payload.key]: true },
          })
          track("vasantpur_scry_engaged", {
            key:           msg.payload.key,
            scenario_slug: scenarioRow?.slug,
            session_id:    sessionIdRef.current,
          })
          break
        }

        case "vasantpur:sessionComplete": {
          if (!sessionIdRef.current) break
          const payload = {
            ...msg.payload,
            clusterId:  scenarioRow?.story_cluster_id ?? msg.payload.clusterId,
            scenarioId: scenarioRow?.id ?? msg.payload.scenarioId,
          }
          await completeGameSession(sessionIdRef.current, payload)

          // Send community stats back to the game for the reveal screen
          if (payload.clusterId) {
            const stats = await getTodaysCommunityStats(payload.clusterId)
            if (stats && iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(
                { type: "vasantpur:communityStats", payload: stats },
                "*"
              )
            }
          }

          track("vasantpur_session_complete", {
            total_score:     msg.payload.totalScore,
            conclusion_type: msg.payload.conclusionType,
            scenario_slug:   scenarioRow?.slug,
            session_id:      sessionIdRef.current,
          })

          sessionIdRef.current = null
          break
        }
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [scenarioRow, postScenarioToGame])

  return (
    <div className="max-w-[560px] mx-auto px-4 py-6">
      <iframe
        ref={iframeRef}
        src={IFRAME_SRC}
        onLoad={postScenarioToGame}
        className="w-full border-0 rounded-xl"
        style={{ height: "100vh", minHeight: 600 }}
        title="Vasantpur"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
