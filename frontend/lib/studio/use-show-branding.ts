/**
 * useShowBranding — the resolved "paint the hired.video watermark?" answer
 * for the signed-in user: `shouldShowBranding` over their plan and their
 * remove-branding toggle. One hook so the DOM pill (`<BrandWatermark/>`) and
 * the canvas-rendered preview (which paints the export's own watermark)
 * can't disagree.
 */
import { useSubscription } from "@/lib/hooks/useSubscription";
import { shouldShowBranding } from "./branding-policy";
import { useRemoveBrandingFlag } from "./use-remove-branding-flag";

export function useShowBranding(): boolean {
  const { isPro } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  return shouldShowBranding({ isPro, removeBrandingFlag: removeBranding });
}
