// Global "Buy AI tokens" right slide-out. Mounted once at the App root and
// opened from anywhere via `openTokenPackSheet()` (pill, limit banner,
// settings card). Self-gating: only signed-in Pro viewers with a metered
// budget can buy packs — for anyone else the open event is ignored.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { formatTokens, useTokenBudget } from "@/hooks/use-token-budget";
import { useTokenPackPurchase } from "@/hooks/use-token-pack-purchase";
import { TOKEN_PACK_SHEET_OPEN_EVENT } from "@/lib/token-pack-sheet";
import { TokenBalanceSummary } from "@/components/billing/TokenBalanceSummary";
import { TokenPackOptions } from "@/components/billing/TokenPackOptions";
import { resumePendingTokenPackConfirms } from "@/lib/billing/pending-token-pack-confirms";
import { broadcastTokenBudget } from "@/lib/api-client";
import { refreshSharedResource } from "@/hooks/use-gated-resource";
import { TOKEN_BUDGET_CACHE_KEY } from "@/hooks/use-token-budget";

export function TokenPackSheetHost() {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const budget = useTokenBudget();
  const { state, buy, reset } = useTokenPackPurchase();
  const [open, setOpen] = useState(false);

  const canBuy = Boolean(user) && !isGuest && !budget.isLoading && budget.isPro && !budget.isUnlimited;

  // A pack paid in an earlier visit whose confirm never reached the server
  // (tab closed, network drop): re-send it once per signed-in session (#2352).
  const userId = user && !isGuest ? user.id : null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void resumePendingTokenPackConfirms(userId).then(async (results) => {
      const last = results[results.length - 1];
      if (cancelled || !last) return;
      broadcastTokenBudget(last.tokenBudget);
      await refreshSharedResource(TOKEN_BUDGET_CACHE_KEY);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(TOKEN_PACK_SHEET_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TOKEN_PACK_SHEET_OPEN_EVENT, onOpen);
  }, []);

  if (!canBuy) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("billing.tokenPacks.title")}</SheetTitle>
          <SheetDescription>{t("billing.tokenPacks.subtitle")}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <TokenBalanceSummary budget={budget} />

          {state.status === "done" && (
            <p role="status" className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {state.tokensGranted > 0
                ? t("billing.tokenPacks.success", { tokens: formatTokens(state.tokensGranted) })
                : t("billing.tokenPacks.alreadyAdded")}
            </p>
          )}
          {state.status === "pending" && (
            <p role="status" className="text-sm font-medium text-foreground">
              {t("billing.tokenPacks.pending")}
            </p>
          )}
          {state.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {t(state.errorKey)}
            </p>
          )}

          <TokenPackOptions
            busyPackId={state.status === "processing" ? state.packId : null}
            onBuy={(packId) => void buy(packId)}
          />

          <p className="text-xs text-muted-foreground">{t("billing.tokenPacks.footnote")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
