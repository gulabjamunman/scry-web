import { NavLink } from "@/components/NavLink"
import { useAuth } from "@/lib/auth"
import { useNavigate, useLocation } from "react-router-dom"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Home, Newspaper, BarChart3, Telescope,
  LogIn, LogOut, ClipboardCheck, Lock,
  Building2, Radio, FileText, Users, Youtube,
} from "lucide-react"

export function AppSidebar() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const location         = useLocation()

  const mainItems = [
    { title: "Home",             url: "/",         icon: Home,      end: true  },
    { title: "Article Explorer", url: "/explorer", icon: Newspaper, end: false },
    { title: "Watch",            url: "/watch",    icon: Youtube,   end: false },
    { title: "Insights",         url: "/insights", icon: BarChart3, end: false },
  ]

  // Newsroom sub-items — only shown when logged in with org
  const newsroomSubItems = [
    { title: "Signals",     url: "/newsroom/signals",     icon: Radio    },
    { title: "Draft",       url: "/newsroom/draft",       icon: FileText },
    { title: "Journalists", url: "/newsroom/journalists", icon: Users    },
  ]

  const isNewsroomActive = location.pathname.startsWith("/newsroom")

  async function handleLogout() {
    await logout()
    navigate("/")
  }

  return (
    <Sidebar>
      <SidebarContent>

        {/* Brand */}
        <div className="px-4 py-5 border-b">
          <div className="flex items-center gap-2.5">
            <Telescope className="h-5 w-5 text-sidebar-primary" />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-sidebar-primary">SCRY</h1>
              <p className="text-[10px] text-muted-foreground">Narrative Intelligence</p>
            </div>
          </div>
        </div>

        {/* Main nav */}
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.end}
                      className="text-sidebar-foreground hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Observatory — public, no gate */}
        <SidebarGroup>
          <SidebarGroupLabel>Intelligence</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/clusters"
                    className="text-sidebar-foreground hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <Telescope className="mr-2 h-4 w-4" />
                    <span>Observatory</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Newsroom — org-gated, show lock for non-members */}
        <SidebarGroup>
          <SidebarGroupLabel>Newsroom</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>

              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={user ? "/newsroom" : "/login"}
                    end
                    className="text-sidebar-foreground hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <span className="flex-1">Newsroom Intelligence</span>
                    {!user && <Lock className="h-3 w-3 text-muted-foreground/50 ml-auto" />}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Sub-items only visible when inside newsroom or logged in */}
              {user && newsroomSubItems.map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="pl-8 text-sidebar-foreground hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-3.5 w-3.5" />
                      <span className="text-[13px]">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Community */}
        <SidebarGroup>
          <SidebarGroupLabel>Community</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={user ? "/reviewer" : "/login"}
                    className="text-sidebar-foreground hover:bg-sidebar-accent"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    <span className="flex-1">Reviewer Hub</span>
                    {!user && <Lock className="h-3 w-3 text-muted-foreground/50 ml-auto" />}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Auth */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                {user ? (
                  <SidebarMenuButton
                    onClick={handleLogout}
                    className="text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/login"
                      className="text-sidebar-foreground hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <LogIn className="mr-2 h-4 w-4" />
                      <span>Sign in</span>
                    </NavLink>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  )
}