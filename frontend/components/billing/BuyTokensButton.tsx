// "Buy AI tokens" — opens the global token-pack sheet. Self-gating: renders
// only for Pro viewers with a metered budget (packs top up Pro; free users
// upgrade instead, unlimited/staff never need one).

import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useTokenBudget } from "@/hooks/use-token-budget";
import { openTokenPackSheet } from "@/lib/token-pack-sheet";

interface BuyTokensButtonProps {
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

export function BuyTokensButton({ size = "sm", variant = "default", className }: BuyTokensButtonProps) {
  const { t } = useTranslation();
  const budget = useTokenBudget();
  if (budget.isLoading || !budget.isPro || budget.isUnlimited) return null;
  return (
    <Button size={size} variant={variant} className={className} onClick={openTokenPackSheet}>
      <Zap className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      {t("billing.tokenPacks.cta")}
    </Button>
  );
}
