/**
 * AuthLayout — the one page frame every auth / account-entry route renders
 * (sign in, sign up, reset, verify, invitation, partner consent …).
 *
 * Owns the full page chrome (AppShell + useSEO + useBreadcrumbs, so pages
 * satisfy `hiredvideo/require-page-chrome` by composition) and the design
 * system's auth composition: the form column on the left and a calm ink
 * brand panel on the right at md+, collapsing to a single column on mobile.
 * Pages pass their card(s) as children — usually via <AuthCard>.
 */
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { AuthMarketingPanel, type AuthMarketingVariant } from "@/components/auth/AuthMarketingPanel";

export interface AuthLayoutProps {
  /** Route key handed to useSEO (PAGE_SEO entry or the live pathname). */
  seoPath: string;
  /** Breadcrumb trail for the BreadcrumbList JSON-LD. */
  breadcrumbs: { name: string; url: string }[];
  /** Brand panel persona. `null` renders the form column alone, centred
   *  (transient states such as loading spinners). */
  panel?: AuthMarketingVariant | null;
  children: ReactNode;
}

export function AuthLayout({ seoPath, breadcrumbs, panel = "signIn", children }: AuthLayoutProps) {
  useSEO(seoPath);
  useBreadcrumbs(breadcrumbs);

  return (
    <AppShell bgClassName="bg-background">
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-8 sm:px-6 md:py-14",
          panel ? "md:grid-cols-2 md:items-stretch" : "max-w-[560px]",
        )}
      >
        <div className="flex min-w-0 flex-col justify-center">{children}</div>
        {panel && <AuthMarketingPanel variant={panel} />}
      </div>
    </AppShell>
  );
}
