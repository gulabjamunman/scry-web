// ============================================================
// src/components/ExportBriefButton.tsx
//
// Drop-in button for NarrativeIntelligencePage.
// Only renders when the cluster has report_enabled = true.
//
// Usage — add to NarrativeIntelligencePage after fetching data:
//
//   import { ExportBriefButton } from "@/components/ExportBriefButton"
//
//   // In your data fetch, add report_enabled to the select:
//   // .select("..., report_enabled, report_cache")
//
//   // In the render, near the top of the page (after StoryIdentity):
//   <ExportBriefButton
//     clusterId={clusterId}
//     reportEnabled={data.identity.report_enabled}
//     hasCachedBrief={!!data.identity.report_cache}
//   />
// ============================================================

import { useState } from "react"
import { FileText, Loader } from "lucide-react"

interface Props {
  clusterId:       string
  reportEnabled:   boolean
  hasCachedBrief:  boolean
}

export function ExportBriefButton({ clusterId, reportEnabled, hasCachedBrief }: Props) {
  const [loading, setLoading] = useState(false)

  if (!reportEnabled) return null

  function handleClick() {
    // Open the brief in a new tab.
    // The brief page itself calls the edge function and handles loading state.
    window.open(`/cluster/${clusterId}/brief`, "_blank", "noopener,noreferrer")
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/30 px-4 py-2 text-sm font-medium text-foreground transition-colors disabled:opacity-50"
    >
      {loading
        ? <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
        : <FileText className="h-4 w-4 text-muted-foreground" />
      }
      Export Brief
      {!hasCachedBrief && (
        <span className="text-xs text-muted-foreground font-normal">(generates on first open)</span>
      )}
    </button>
  )
}
