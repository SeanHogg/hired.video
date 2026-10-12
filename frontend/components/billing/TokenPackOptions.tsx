// Presentational: the token packs on sale (shared/pricing.ts TOKEN_PACKS),
// each with its size, effective per-million price, and a buy button.

import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTokens } from "@/hooks/use-token-budget";
import { TOKEN_PACKS, formatUsdPrice, tokenPackDollarsPerMillion } from "@shared/pricing";

interface TokenPackOptionsProps {
  /** Pack currently being bought (spinner); every button disables meanwhile. */
  busyPackId: string | null;
  onBuy: (packId: string) => void;
}

export function TokenPackOptions({ busyPackId, onBuy }: TokenPackOptionsProps) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="grid gap-3">
      {TOKEN_PACKS.map((pack) => (
        <li
          key={pack.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{t(pack.labelKey)}</p>
            <p className="text-sm text-muted-foreground">
              {t("billing.tokenPacks.size", {
                tokens: formatTokens(pack.tokens),
                perMillion: formatUsdPrice(tokenPackDollarsPerMillion(pack), i18n.language),
              })}
            </p>
          </div>
          <Button className="min-h-10" disabled={busyPackId !== null} onClick={() => onBuy(pack.id)}>
            {busyPackId === pack.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("billing.tokenPacks.buy", { price: formatUsdPrice(pack.price, i18n.language) })}
          </Button>
        </li>
      ))}
    </ul>
  );
}
