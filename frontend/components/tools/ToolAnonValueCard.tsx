// Shared marketing card rendered above every full-page tool surface for
// logged-out visitors. Self-gates on `useAuth().isAuthenticated` and on
// the catalog lookup — there is no `show` prop to drill from the parent.
// Drop-in via `<ToolPageHeader toolId="..." />`; the header invokes this
// once and the card disappears automatically when the visitor signs in.
//
// Why a single shared component:
//   - Every tool used to be on its own for "what should an anon visitor
//     see before they hit AuthOverlay?" — most rendered nothing, which
//     is why the user reported missing marketing/SEO context.
//   - The catalog already has the canonical title / description / features
//     for each tool, so the card derives all copy from `TOOLS_CATALOG`
//     instead of asking each page to repeat itself.

import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, LogIn, Sparkles, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import MonoChip from "@/components/templates/MonoChip";
import { useAuth } from "@/lib/auth";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import { localizeTool } from "@/lib/tools/localize-tool";

interface Props {
  toolId: string;
}

export function ToolAnonValueCard({ toolId }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Authenticated users have already converted — no marketing surface.
  if (isAuthenticated) return null;

  const rawEntry = TOOLS_CATALOG.find((tool) => tool.id === toolId);
  // Catalog miss is a soft-fail: better to render the tool with no
  // marketing strip than to crash the page on a typo'd toolId.
  if (!rawEntry) return null;
  const entry = localizeTool(rawEntry, t);

  const redirectTarget = `${location.pathname}${location.search}`;
  const redirectQuery = `?redirect=${encodeURIComponent(redirectTarget)}`;

  // The page header above already shows the tool's name + lede, so this
  // strip carries only what a signed-out visitor still needs: what they
  // get, and the free sign-up.
  return (
    <section
      aria-label={entry.title}
      className="flex flex-wrap items-start gap-5 rounded-[20px] border border-border bg-card p-5 md:p-6"
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        <MonoChip tone={entry.tier === "free" ? "free" : "neutral"} className="self-start">
          {entry.tier === "free" ? t("tools.anonCard.freeBadge") : t("tools.anonCard.proBadge")}
        </MonoChip>
        {entry.features && entry.features.length > 0 && (
          <ul className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
            {entry.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-56 sm:shrink-0">
        <Button asChild className="min-h-[44px]">
          <Link to={`/signup${redirectQuery}`}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("tools.anonCard.signupCta")}
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link to={`/login${redirectQuery}`}>
            <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("actions.signIn")}
          </Link>
        </Button>
        <p className="flex items-center justify-center gap-1 pt-1 text-center text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t("tools.anonCard.assurance")}
        </p>
      </div>
    </section>
  );
}
