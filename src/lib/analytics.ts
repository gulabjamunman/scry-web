/**
 * analytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around PostHog for SCRY-specific events.
 * PostHog is initialised in src/lib/posthog.ts (by the PostHog wizard).
 * This file only defines named event helpers — no init logic here.
 *
 * Usage: import { trackClusterOpened } from "@/lib/analytics"
 */

import posthog from "posthog-js"

// ── Identity ──────────────────────────────────────────────────────────────────

export function identifyUser(userId: string, props?: Record<string, any>) {
  posthog.identify(userId, props)
}

export function resetUser() {
  posthog.reset()
}

// ── Observatory / Cluster events ──────────────────────────────────────────────

export function trackClusterListViewed(props: {
  isLoggedIn: boolean
  clusterCount: number
  richCount: number
}) {
  posthog.capture("cluster_list_viewed", props)
}

export function trackClusterOpened(props: {
  clusterId: string
  clusterTitle: string
  isLoggedIn: boolean
  isFree: boolean
  articleCount: number
  source: "homepage_story_of_day" | "homepage_grid" | "cluster_list" | "direct_link"
}) {
  posthog.capture("cluster_opened", props)
}

export function trackClusterGateShown(props: {
  clusterId?: string
  source: "cluster_list" | "cluster_detail"
}) {
  posthog.capture("cluster_gate_shown", props)
}

export function trackClusterGateSignupClicked(props: {
  clusterId?: string
  source: "cluster_list" | "cluster_detail"
}) {
  posthog.capture("cluster_gate_signup_clicked", props)
}

export function trackClusterGateLoginClicked(props: {
  clusterId?: string
  source: "cluster_list" | "cluster_detail"
}) {
  posthog.capture("cluster_gate_login_clicked", props)
}

// ── Early access events ───────────────────────────────────────────────────────

export function trackEarlyAccessSubmitted(props: {
  source: "homepage_cta" | "early_access_banner" | "other"
  isLoggedIn: boolean
}) {
  posthog.capture("early_access_submitted", props)
}

// ── Auth events ───────────────────────────────────────────────────────────────

export function trackSignupCompleted(props: { userId: string; email: string }) {
  posthog.capture("signup_completed", props)
  identifyUser(props.userId, { email: props.email })
}

export function trackLoginCompleted(props: { userId: string }) {
  posthog.capture("login_completed", props)
  identifyUser(props.userId)
}

export function trackLogout() {
  posthog.capture("logout")
  resetUser()
}

// ── Draft analyzer events ─────────────────────────────────────────────────────

export function trackDraftAnalyzed(props: {
  wordCount: number
  hasJournalistProfile: boolean
  hasOrgProfile: boolean
  clusterMatched: boolean
}) {
  posthog.capture("draft_analyzed", props)
}

export function trackJournalistProfileLoaded(props: {
  mode: "byline" | "pdfs"
  articleCount: number
}) {
  posthog.capture("journalist_profile_loaded", props)
}

// ── Journalist intelligence events ────────────────────────────────────────────

export function trackJournalistOpened(props: {
  byline: string
  publisher: string
  articleCount: number
}) {
  posthog.capture("journalist_opened", props)
}

// ── Signals events ────────────────────────────────────────────────────────────

export function trackSignalsDashboardViewed(props: {
  signalCount: number
}) {
  posthog.capture("signals_dashboard_viewed", props)
}

// ── Generic ───────────────────────────────────────────────────────────────────

export function track(event: string, props?: Record<string, any>) {
  posthog.capture(event, props)
}