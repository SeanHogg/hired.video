// Generic page shell for marketplace item previews — resume templates today,
// job templates / company templates / voice clones tomorrow. Owns the page
// chrome (sidebar, top nav, footer, sticky action bar) so per-item pages only
// supply the badges/actions/preview/sidebar slots and the cart wiring.
//
// Usage: <MarketplaceItemShell badges={...} actions={...} preview={...}
//          sidebar={<CreatorBanner />} />

import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSidebar } from "@/hooks/use-sidebar";

interface MarketplaceItemShellProps {
  /** Left side of the action bar — usually item name / category badges. */
  badges: ReactNode;
  /** Right side of the action bar — primary CTAs (Add to Cart, etc.). */
  actions: ReactNode;
  /** Main preview area — the rendered template / job / company / etc. */
  preview: ReactNode;
  /** Optional right-rail aside — creator pitch, related items, reviews. */
  sidebar?: ReactNode;
  /** Optional invisible node for SEO injection (useSEO hook holder). */
  seo?: ReactNode;
}

export default function MarketplaceItemShell({
  badges,
  actions,
  preview,
  sidebar,
  seo,
}: MarketplaceItemShellProps) {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {seo}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="bg-muted/30 border-b">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">{badges}</div>
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            </div>
          </div>

          <div className="flex">
            <div className="flex-1 min-w-0">{preview}</div>
            {sidebar && (
              <aside className="hidden lg:block w-[320px] shrink-0 border-l bg-card sticky top-16 self-start max-h-[calc(100vh-4rem)] overflow-auto">
                {sidebar}
              </aside>
            )}
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
}
