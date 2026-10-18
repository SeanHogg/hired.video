import { useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { readAttribution } from "@/lib/attribution";
import { useAttributionCapture } from "@/lib/hooks/useAttributionCapture";

export function ReferralCapture() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref");
      if (code) {
        sessionStorage.setItem("ref", code);
      }
    } catch {
      // no-op
    }
  }, []);
  return null;
}

// Fires a GTM page_view event on every SPA route change. Attribution
// capture (first-touch `?ref=` + `utm_*` into a 30-day cookie) is
// delegated to the shared `useAttributionCapture` hook — see
// `lib/attribution.ts` for the single-source policy.
export function GTMPageTracker() {
  const location = useLocation();
  useAttributionCapture();

  useEffect(() => {
    try {
      const attr = readAttribution();
      const w = window;
      w.dataLayer = w.dataLayer || [];
      w.dataLayer.push({
        event: "page_view",
        page_path: location.pathname + location.search,
        page_title: document.title,
        utm_source: attr.utmSource,
        utm_medium: attr.utmMedium,
        utm_campaign: attr.utmCampaign,
        utm_term: attr.utmTerm,
        utm_content: attr.utmContent,
      });
    } catch {
      // no-op
    }
  }, [location.pathname, location.search]);

  return null;
}

// Mirrors the `?print=1` querystring onto a `data-print-mode` attribute on
// <body>. Paired with the CSS rule in global.css that hides any element
// tagged `data-print-hide` while the attribute is set — so the AI brain,
// mobile nav, install prompt, and chat panels disappear from the on-screen
// print-preview view, not just from the actual print render. Keeping the
// detection in one place (rather than a `printMode` boolean prop drilled
// into every chrome component) is what lets new chrome opt in by tagging
// `data-print-hide` and nothing else.
export function PrintModeBodyAttribute() {
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get("print") === "1";
  useEffect(() => {
    if (printMode) {
      document.body.dataset.printMode = "true";
    } else {
      delete document.body.dataset.printMode;
    }
    return () => {
      delete document.body.dataset.printMode;
    };
  }, [printMode]);
  return null;
}
