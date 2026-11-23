import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu, Telescope } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react"
import { useEffect } from "react";
import posthog from "posthog-js";

import { useScrollMemory } from "./hooks/useScrollMemory";
import { AuthProvider } from "./lib/auth";
import { FreeClusterProvider } from "./contexts/FreeClusterContext";

// ── Pages ──────────────────────────────────────────────────────────────────
import HomePage                  from "./pages/HomePage";
import ExplorerPage               from "./pages/ExplorerPage";
import ArticleDetailPage          from "./pages/ArticleDetailPage";
import ReviewPage                 from "./pages/ReviewPage";
import InsightsHubPage            from "./pages/InsightsHubPage";
import IdeologicalMapPage         from "./pages/IdeologicalMapPage";
import AnalyticsPage              from "./pages/AnalyticsPage";
import MediaLandscapePage         from "./pages/MediaLandscapePage";
import TransparencyPage           from "./pages/TransparencyPage";
import ReviewerHubPage            from "./pages/ReviewerHubPage";
import VasantpurPage              from "./pages/VasantpurPage"
import ClusterBriefPage           from "./pages/ClusterBriefPage";

// ── Newsroom Intelligence (org-gated) ─────────────────────────────────────
import NewsroomPage               from "./pages/NewsroomPage";
import NewsroomGuard              from "./components/NewsroomGuard";

// ── Intelligence features (now served under /newsroom/*) ──────────────────
import ClusterListPage            from "./pages/ClusterListPage";
import WatchPage            from "./pages/WatchPage";
import WatchVideoPage            from "./pages/WatchVideoPage";
import NarrativeIntelligencePage  from "./pages/NarrativeIntelligencePage";
import SignalsDashboard           from "./pages/SignalsDashboard";
import DraftComparison            from "./pages/DraftComparison";
import JournalistIntelligence     from "./pages/JournalistIntelligence";

// ── Legacy Observatory (kept for backwards compat) ─────────────────────────
import PendingApprovalPage        from "./pages/PendingApprovalPage";
import ProtectedRoute             from "./components/ProtectedRoute";

// ── Auth ───────────────────────────────────────────────────────────────────
import LoginPage                  from "./pages/LoginPage";
import SignupPage                 from "./pages/SignupPage";
import CheckEmailPage             from "./pages/CheckEmailPage";
import EmailConfirmedPage         from "./pages/EmailConfirmedPage";
import ForgotPasswordPage         from "./pages/ForgotPasswordPage";
import ResetPasswordPage          from "./pages/ResetPasswordPage";
import AuthCallbackPage           from "./pages/AuthCallbackPage";
import NotFound                   from "./pages/NotFound";

// ── Admin ──────────────────────────────────────────────────────────────────
import AdminLoginPage             from "./pages/AdminLoginPage";
import AdminPage                  from "./pages/AdminPage";
import AdminGuard                 from "./components/AdminGuard";

const queryClient = new QueryClient();

function PostHogPageView() {
  const location = useLocation();
  useEffect(() => {
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [location]);
  return null;
}

function AppHeader() {
  return (
    <header className="h-13 flex items-center border-b bg-card px-4 shrink-0 gap-3">
      <SidebarTrigger className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
        <Menu className="h-4 w-4" />
        <span className="text-xs font-medium tracking-wide">Menu</span>
      </SidebarTrigger>
      <div className="flex items-center gap-2 ml-1">
        <Telescope className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">SCRY</span>
      </div>
    </header>
  )
}

function AppLayout() {
  const mainRef = useScrollMemory();

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">

        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">

          <AppHeader />

          <main ref={mainRef} className="flex-1 overflow-auto">
            <Routes>

              {/* ── Public ───────────────────────────────────────────── */}
              <Route path="/"                  element={<HomePage />} />
              <Route path="/explorer"          element={<ExplorerPage />} />
              <Route path="/article/:id"       element={<ArticleDetailPage />} />
              <Route path="/review/:articleId" element={<ReviewPage />} />
              <Route path="/insights"          element={<InsightsHubPage />} />
              <Route path="/map"               element={<IdeologicalMapPage />} />
              <Route path="/analytics"         element={<AnalyticsPage />} />
              <Route path="/media-landscape"   element={<MediaLandscapePage />} />
              <Route path="/transparency"      element={<TransparencyPage />} />
              <Route path="/vasantpur"         element={<VasantpurPage />} />
              <Route path="/cluster/:clusterId/brief" element={<ClusterBriefPage />} />

              {/* ── Public Observatory — 2 clusters free, rest gated ─── */}
              <Route path="/clusters"           element={<ClusterListPage />} />
              <Route path="/watch"              element={<WatchPage />} />
              <Route path="/watch/:id"          element={<WatchVideoPage />} />
              <Route path="/clusters/trending"  element={<ClusterListPage trending />} />
              <Route path="/cluster/:clusterId" element={<NarrativeIntelligencePage />} />

              {/* ── Reviewer (login required) ─────────────────────────── */}
              <Route path="/reviewer" element={
                <ProtectedRoute><ReviewerHubPage /></ProtectedRoute>
              } />

              {/* ── Newsroom Intelligence (org membership required) ────── */}
              <Route path="/newsroom" element={
                <NewsroomGuard><NewsroomPage /></NewsroomGuard>
              } />
              <Route path="/newsroom/observatory" element={
                <NewsroomGuard><ClusterListPage /></NewsroomGuard>
              } />
              <Route path="/newsroom/observatory/trending" element={
                <NewsroomGuard><ClusterListPage trending /></NewsroomGuard>
              } />
              <Route path="/newsroom/observatory/:clusterId" element={
                <NewsroomGuard><NarrativeIntelligencePage /></NewsroomGuard>
              } />
              <Route path="/newsroom/signals" element={
                <NewsroomGuard><SignalsDashboard /></NewsroomGuard>
              } />
              <Route path="/newsroom/draft" element={
                <NewsroomGuard><DraftComparison /></NewsroomGuard>
              } />
              <Route path="/newsroom/journalists" element={
                <NewsroomGuard><JournalistIntelligence /></NewsroomGuard>
              } />

              {/* ── Legacy gated routes — kept for old bookmarks ──────── */}
              <Route path="/signals" element={
                <NewsroomGuard><SignalsDashboard /></NewsroomGuard>
              } />
              <Route path="/draft" element={
                <NewsroomGuard><DraftComparison /></NewsroomGuard>
              } />
              <Route path="/journalists" element={
                <NewsroomGuard><JournalistIntelligence /></NewsroomGuard>
              } />

              {/* ── Auth ─────────────────────────────────────────────── */}
              <Route path="/login"           element={<LoginPage />} />
              <Route path="/signup"          element={<SignupPage />} />
              <Route path="/auth/callback"   element={<AuthCallbackPage />} />
              <Route path="/check-email"     element={<CheckEmailPage />} />
              <Route path="/email-confirmed" element={<EmailConfirmedPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password"  element={<ResetPasswordPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

              {/* ── Legacy routes (kept for backwards compat) ────────── */}
              <Route path="/pending-approval"   element={<PendingApprovalPage />} />

              {/* ── Catch all ────────────────────────────────────────── */}
              <Route path="*" element={<NotFound />} />

            </Routes>
          </main>

        </div>
      </div>
    </SidebarProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PostHogPageView />
        <AuthProvider>
          <FreeClusterProvider>
            {/* Admin routes — outside AppLayout so no sidebar is shown */}
            <Routes>
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin"       element={<AdminGuard><AdminPage /></AdminGuard>} />
              <Route path="/*"           element={<AppLayout />} />
            </Routes>
          </FreeClusterProvider>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
