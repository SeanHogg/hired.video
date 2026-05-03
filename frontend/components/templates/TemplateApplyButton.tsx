// Self-gating primary CTA for any TemplateMeta. Reads ownership, paid state,
// and auth from useApplyTemplate so callers don't drill canBuy / canApply
// booleans through the component tree.

import { Check, Loader2, ShoppingCart, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useApplyTemplate } from "@/lib/templates/use-apply-template";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props extends Omit<ButtonProps, "onClick" | "children"> {
  meta: TemplateMeta;
  /** When true, hides the leading icon to fit narrow layouts (e.g. card rows). */
  iconless?: boolean;
}

export default function TemplateApplyButton({ meta, iconless = false, ...rest }: Props) {
  const { apply, ctaLabel, isOwned, isPaid, busy } = useApplyTemplate(meta);

  const Icon = busy
    ? Loader2
    : isOwned
      ? Check
      : isPaid
        ? ShoppingCart
        : Sparkles;

  return (
    <Button {...rest} onClick={() => void apply()} disabled={busy || rest.disabled}>
      {!iconless && <Icon className={`w-4 h-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />}
      {ctaLabel}
    </Button>
  );
}
