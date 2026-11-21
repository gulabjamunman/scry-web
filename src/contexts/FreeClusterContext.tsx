import { createContext, useContext, useState, useEffect, ReactNode } from "react"

type FreeClusterContextType = {
  ready: boolean
  isFree: (clusterId: string) => boolean
  freeIds: Set<string>
}

const FreeClusterContext = createContext<FreeClusterContextType>({
  ready: false,
  isFree: () => false,
  freeIds: new Set(),
})

// Hardcoded demo cluster IDs (most recent/interesting ones)
// Admin can update these in the dashboard
const DEFAULT_FREE_CLUSTER_IDS = [
  // These should be replaced with your actual demo cluster IDs
  // For now, we'll load them from database
]

export function FreeClusterProvider({ children }: { children: ReactNode }) {
  const [freeIds, setFreeIds] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function loadFreeClusterIds() {
      try {
        // Load from a feature flag or config table
        // For now, just set defaults
        setFreeIds(new Set(DEFAULT_FREE_CLUSTER_IDS))
        setReady(true)
      } catch (error) {
        console.error("Failed to load free cluster IDs:", error)
        setReady(true) // Still mark as ready, just with empty set
      }
    }

    loadFreeClusterIds()
  }, [])

  function isFree(clusterId: string): boolean {
    return freeIds.has(clusterId)
  }

  return (
    <FreeClusterContext.Provider value={{ ready, isFree, freeIds }}>
      {children}
    </FreeClusterContext.Provider>
  )
}

export function useFreeCluster() {
  return useContext(FreeClusterContext)
}
