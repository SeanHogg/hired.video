import StudioMarketingHeader from "@/components/studio/StudioMarketingHeader";
import StudioMarketingSections from "@/components/studio/StudioMarketingSections";
import { useAuth } from "@/lib/auth";

/**
 * Signed-out marketing hero (the "red region"). It sits ABOVE the same
 * workspace a signed-in user sees — the only difference for an anonymous
 * visitor is this band + an empty "My content". Self-gated to `!user` so
 * signed-in users go straight to the workspace.
 */
export function StudioLandingHero() {
  const { user } = useAuth();
  if (user) return null;
  return <StudioMarketingHeader />;
}

/**
 * Signed-out marketing band (stats · features · how-it-works · kind grid ·
 * FAQ structured data · final CTA). Renders BELOW the workspace so crawlers
 * + first-time visitors still get the full studio pitch the unified /studio
 * used to carry; self-gated to `!user`.
 */
export function StudioLandingMarketingSections() {
  const { user } = useAuth();
  if (user) return null;
  return <StudioMarketingSections />;
}
