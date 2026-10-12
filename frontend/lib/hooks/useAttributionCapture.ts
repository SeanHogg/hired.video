import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureAttribution } from "../attribution";

/**
 * Capture inbound `?ref=` and `utm_*` querystring params on every route
 * change. First-touch policy + 30-day cookie persistence live inside
 * `captureAttribution` — this hook just wires it to React Router.
 *
 * Mount once at the app root (App.tsx). Idempotent; no consumer-level
 * gating needed.
 */
export function useAttributionCapture(): void {
  const location = useLocation();
  useEffect(() => {
    captureAttribution(location.search, document.referrer);
  }, [location.search]);
}
