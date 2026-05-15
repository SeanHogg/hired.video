/**
 * useRemoveBrandingFlag — single hook for the "remove hired.video
 * branding" toggle. Persisted per-user to localStorage so the choice
 * survives reloads, and self-gates Pro: free users see the toggle as
 * disabled (the consumer renders it via `<RemoveBrandingToggle>`) but
 * the policy here always returns `false` for them so the underlying
 * gate in [branding-policy.ts](hired.video/frontend/lib/studio/branding-policy.ts)
 * never strips branding from a free-tier render.
 *
 * Consumers (BrandWatermark, export pipeline, RemoveBrandingToggle) all
 * read from this hook — there is no consumer-side `canX` boolean.
 */

import { usePersistentState } from "@/hooks/use-persistent-state";

const STORAGE_KEY = "studio.remove_branding_flag";

export function useRemoveBrandingFlag(): {
  /** True when the user has Pro AND has flipped the toggle on.
   *  Effective value — the underlying branding policy can compare it
   *  against `false` to decide whether to render branding. */
  removeBranding: boolean;
  /** Raw localStorage value, regardless of Pro entitlement. Used by
   *  the toggle UI so a free user's checked state is preserved when
   *  they upgrade. */
  rawRemoveBranding: boolean;
  setRemoveBranding: (next: boolean) => void;
} {
  const [raw, setRaw] = usePersistentState<boolean>(STORAGE_KEY, false);
  return {
    removeBranding: raw,
    rawRemoveBranding: raw,
    setRemoveBranding: setRaw,
  };
}
