// src/components/AdminGuard.tsx
//
// Wraps every /admin/* route.
// Checks the admin session (separate from user session).
// Redirects to /admin/login if not authenticated.
// Shows nothing while checking — no flash of content.

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader } from "lucide-react"
import { isAdminAuthenticated } from "@/lib/admin-auth"

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const navigate  = useNavigate()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    isAdminAuthenticated().then(authed => {
      if (!authed) navigate("/admin/login", { replace: true })
      else         setOk(true)
    })
  }, [navigate])

  if (!ok) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  )

  return <>{children}</>
}
