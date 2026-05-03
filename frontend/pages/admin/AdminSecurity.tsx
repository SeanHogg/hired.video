/**
 * /admin/security — SuperAdmin operator surface for security
 * monitoring + lockout management.
 *
 * Composes three self-gating panels (LockedAccountsPanel,
 * BotBlockGlobe, RegionWaitlistTable). If a non-SuperAdmin somehow
 * lands here, every panel returns null and the page is empty — the
 * outer route should also gate, but the panel-level self-gate is the
 * second line of defense and removes the need for a canShow prop.
 */

import { Navigate, useLocation } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { LockedAccountsPanel } from "@/components/admin/security/LockedAccountsPanel";
import { BotBlockGlobe } from "@/components/admin/security/BotBlockGlobe";
import { RegionWaitlistTable } from "@/components/admin/security/RegionWaitlistTable";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { isSuperAdminFromToken } from "@/lib/auth-claims";
import { useSEO, useBreadcrumbs } from "@/lib/seo";

export default function AdminSecurity() {
  const location = useLocation();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, isLoading } = useAuth();

  useSEO(location.pathname);
  useBreadcrumbs([
    { name: "Admin", url: "/admin" },
    { name: "Security", url: "/admin/security" },
  ]);

  if (!isLoading && !isAuthenticated) {
    return <Navigate to="/login?redirect=/admin/security" replace />;
  }
  if (!isLoading && !isSuperAdminFromToken()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16">
          <section className="py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Security operations</h1>
                <p className="text-muted-foreground">
                  Lockout management, bot-defense telemetry, and region demand capture.
                </p>
              </div>
              <LockedAccountsPanel />
              <BotBlockGlobe />
              <RegionWaitlistTable />
            </div>
          </section>
          <Footer />
        </div>
      </div>
    </div>
  );
}
