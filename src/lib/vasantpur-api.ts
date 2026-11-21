import { supabase } from "@/lib/supabase"
import type {
  GameScenarioRow,
  GeneratedScenarioPayload,
  VasantpurPayload,
} from "@/lib/vasantpur-types"

// ─────────────────────────────────────────────────────────────────────────────
// Payload normalisation
// The generator writes `sources` and `event_summary`.
// The game engine expects `srcs` and `title`.
// This function bridges the two shapes.
// ─────────────────────────────────────────────────────────────────────────────

function toVasantpurPayload(
  raw: GeneratedScenarioPayload | VasantpurPayload
): VasantpurPayload {
  const srcs =
    (raw as GeneratedScenarioPayload).sources ??
    (raw as VasantpurPayload).srcs ??
    []

  return {
    title:
      (raw as GeneratedScenarioPayload).event_summary ??
      (raw as VasantpurPayload).title ??
      "Daily Story",
    character: raw.character ?? {},
    supporting_cast: raw.supporting_cast ?? [],
    human_scale_location: raw.human_scale_location ?? {},
    srcs,
    scry: raw.scry ?? {
      publishers: [],
      silent: [],
      fr: 0,
      intensity: 0,
      fact: 0,
      insight: "",
      missing: "",
    },
    anno: raw.anno ?? [],
    anno_results: raw.anno_results ?? {},
    wire_sentence: raw.wire_sentence ?? "",
  }
}

function normalizeScenarioRow(row: GameScenarioRow): GameScenarioRow {
  return {
    ...row,
    payload: toVasantpurPayload(row.payload),
  }
}

const SCENARIO_SELECT =
  "id, slug, scenario_date, title, story_cluster_id, payload, model, prompt_version, is_active, created_at, updated_at"

// ─────────────────────────────────────────────────────────────────────────────
// Fetch by explicit slug (e.g. ?slug=naxal-attack-2026-04-10)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchVasantpurScenarioBySlug(
  slug: string
): Promise<GameScenarioRow | null> {
  const { data, error } = await supabase
    .from("game_scenarios")
    .select(SCENARIO_SELECT)
    .eq("slug", slug)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("fetchVasantpurScenarioBySlug error:", error.message)
    return null
  }

  return normalizeScenarioRow(data as GameScenarioRow)
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch today's scenario (most recently updated active scenario for today).
// Falls back to most recent active scenario from any date if today has none.
// Does NOT filter by slug = 'vasantpur' — slugs are now date-specific
// (e.g. "mumbai-floods-2026-04-10") and vary daily.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchTodayVasantpurScenario(): Promise<GameScenarioRow | null> {
  const today = new Date().toISOString().slice(0, 10)

  // Primary: today's scenario
  const { data, error } = await supabase
    .from("game_scenarios")
    .select(SCENARIO_SELECT)
    .eq("scenario_date", today)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!error && data) return normalizeScenarioRow(data as GameScenarioRow)

  // Fallback: most recent available scenario
  const { data: fallback, error: fallbackError } = await supabase
    .from("game_scenarios")
    .select(SCENARIO_SELECT)
    .eq("is_active", true)
    .order("scenario_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallbackError) {
    console.error("fetchTodayVasantpurScenario fallback error:", fallbackError.message)
    return null
  }

  return fallback ? normalizeScenarioRow(fallback as GameScenarioRow) : null
}
