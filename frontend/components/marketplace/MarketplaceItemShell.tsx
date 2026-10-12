// Generic page shell for marketplace item previews — resume templates today,
// job templates / company templates / voice clones tomorrow. Owns the page
// chrome (sidebar, top nav, footer, sticky action bar) so per-item pages only
// supply the badges/actions/preview/sidebar slots and the cart wiring.
//
// Usage: <MarketplaceItemShell badges={...} actions={...} preview={...}
//          sidebar={<CreatorBanner />} />

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

interface MarketplaceItemShellProps {
  /** Left side of the action bar — usually item name / category badges.
   *  Omit both `badges` and `actions` to drop the sticky action bar (pages
   *  that carry their own CTA panel, e.g. the template detail page). */
  badges?: ReactNode;
  /** Right side of the action bar — primary CTAs (Add to Cart, etc.). */
  actions?: ReactNode;
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
  // The action bar pins as a sticky band under the fixed top nav (h-16 =
  // 64px), matching every other action panel across the app. Its height
  // varies (the actions wrap on narrower viewports), so we measure it and
  // pin the right-rail aside at `64 + barHeight` — otherwise the aside,
  // which also pins at the top, would tuck behind the now-sticky bar.
  const actionBarRef = useRef<HTMLDivElement>(null);
  const [asideTop, setAsideTop] = useState(64);
  const hasActionBar = badges != null || actions != null;
  useEffect(() => {
    const el = actionBarRef.current;
    if (!el) {
      setAsideTop(64);
      return;
    }
    const measure = () => setAsideTop(64 + el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasActionBar]);

  return (
    <AppShell bgClassName="bg-background">
      {seo}
      {hasActionBar && (
        <div
          ref={actionBarRef}
          className="sticky top-16 z-30 border-b border-border bg-actionbar/95 backdrop-blur-md"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">{badges}</div>
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          </div>
        </div>
      )}

      <div className="flex">
        <div className="flex-1 min-w-0">{preview}</div>
        {sidebar && (
          <aside
            className="hidden lg:block w-[320px] shrink-0 border-l bg-card sticky self-start overflow-auto"
            style={{ top: asideTop, maxHeight: `calc(100vh - ${asideTop}px)` }}
          >
            {sidebar}
          </aside>
        )}
      </div>
    </AppShell>
  );
}
