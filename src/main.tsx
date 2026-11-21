import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import "./index.css"
import { AuthProvider } from "./lib/auth"
import { initPostHog } from "./lib/posthog"
import { FreeClusterProvider } from "./contexts/FreeClusterContext"

initPostHog()

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <FreeClusterProvider>
      <App />
    </FreeClusterProvider>
  </AuthProvider>
)
