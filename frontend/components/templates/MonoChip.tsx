// Small uppercase mono label chip used across template surfaces (card
// footer, detail panel): FREE / price, industry, BY HIRED.VIDEO · V1.2.

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { templatePriceLabel } from "@/lib/templates/price";

interface Props {
  tone?: "free" | "neutral";
  className?: string;
  children: React.ReactNode;
}

export default function MonoChip({ tone = "neutral", className, children }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-[3px] font-mono text-[11px] uppercase leading-tight",
        tone === "free" ? "bg-brand-green/15 text-brand-green-text" : "bg-muted text-foreground/80",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** FREE (green) or the formatted price — one rule for every template surface. */
export function PriceChip({ priceCents }: { priceCents: number }) {
  const { t, i18n } = useTranslation();
  return (
    <MonoChip tone={priceCents <= 0 ? "free" : "neutral"}>
      {templatePriceLabel(t, priceCents, i18n.language)}
    </MonoChip>
  );
}
