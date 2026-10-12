// /feed entry point. Signed-in members read the feed inside their dashboard
// (pages/Home.tsx embeds it), so they are redirected there exactly as before.
// Signed-out visitors get the feed's OWN pitch (FeedMarketingPage) instead of
// being bounced to /dashboard and shown the dashboard's marketing hero.
// Wire in App.tsx: <Route path="/feed" element={<FeedRoute />} />

import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { usePageChrome } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import FeedMarketingPage from "@/components/feed/FeedMarketingPage";

export default function FeedRoute() {
  usePageChrome();
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-screen items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </AppShell>
    );
  }

  if (isAuthenticated && user) return <Navigate to="/dashboard" replace />;
  return <FeedMarketingPage />;
}
