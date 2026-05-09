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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { TOOLS_CATALOG } from "@/data/tools-catalog";

interface Props {
  toolId: string;
}

export function ToolAnonValueCard({ toolId }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Authenticated users have already converted — no marketing surface.
  if (isAuthenticated) return null;

  const entry = TOOLS_CATALOG.find((tool) => tool.id === toolId);
  // Catalog miss is a soft-fail: better to render the tool with no
  // marketing strip than to crash the page on a typo'd toolId.
  if (!entry) return null;

  const redirectTarget = `${location.pathname}${location.search}`;
  const redirectQuery = `?redirect=${encodeURIComponent(redirectTarget)}`;
  const Icon = entry.icon;

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="p-5 md:p-6">
        <div className="flex flex-col md:flex-row gap-5 md:gap-6 md:items-start">
          <div className="flex items-start gap-3 md:flex-1 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${entry.iconBgClassName}`}
            >
              <Icon className={`h-5 w-5 ${entry.iconColorClassName}`} />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-xl font-semibold leading-tight">
                  {entry.title}
                </h2>
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 text-emerald-700 text-[10px] uppercase tracking-wide"
                >
                  {entry.tier === "free"
                    ? t("tools.anonCard.freeBadge")
                    : t("tools.anonCard.proBadge")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{entry.description}</p>
              {entry.features && entry.features.length > 0 && (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
                  {entry.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:w-56 shrink-0">
            <Button asChild>
              <Link to={`/signup${redirectQuery}`}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t("tools.anonCard.signupCta")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/login${redirectQuery}`}>
                <LogIn className="mr-2 h-4 w-4" />
                {t("actions.signIn")}
              </Link>
            </Button>
            <p className="text-[11px] text-muted-foreground text-center pt-1 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              {t("tools.anonCard.assurance")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
