// Self-gating primary CTA for any TemplateMeta. Reads ownership, paid state,
// and auth from useApplyTemplate so callers don't drill canBuy / canApply
// booleans through the component tree.

import { ArrowRight, Check, Loader2, ShoppingCart, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useApplyTemplate } from "@/lib/templates/use-apply-template";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props extends Omit<ButtonProps, "onClick" | "children"> {
  meta: TemplateMeta;
  /** When true, hides the leading icon to fit narrow layouts (e.g. card rows). */
  iconless?: boolean;
  /** Replaces the computed label ONLY on the free "use"/"claim" path — used by
   *  the homepage "Start from a Template" strip to read "Get started". Never
   *  overrides "Buy — $x" / "Sign in to use", where a generic verb would
   *  misrepresent the action. */
  labelOverride?: string;
  /** Appends a trailing arrow (the "get started →" affordance). */
  withArrow?: boolean;
}

export default function TemplateApplyButton({
  meta,
  iconless = false,
  labelOverride,
  withArrow = false,
  ...rest
}: Props) {
  const { apply, action, ctaLabel, isOwned, isPaid, busy } = useApplyTemplate(meta);

  const Icon = busy
    ? Loader2
    : isOwned
      ? Check
      : isPaid
        ? ShoppingCart
        : Sparkles;

  const canOverride = !busy && (action === "use" || action === "claim");
  const label = canOverride && labelOverride ? labelOverride : ctaLabel;

  return (
    <Button {...rest} onClick={() => void apply()} disabled={busy || rest.disabled}>
      {!iconless && <Icon className={`w-4 h-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />}
      {label}
      {withArrow && !busy && <ArrowRight className="w-4 h-4 ml-1.5" />}
    </Button>
  );
}
