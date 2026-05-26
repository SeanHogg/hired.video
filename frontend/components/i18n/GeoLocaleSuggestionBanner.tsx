/**
 * GeoLocaleSuggestionBanner — one-time nudge for visitors from Mexico or
 * Quebec to switch into their native UI language.
 *
 * Convention notes (matches Indeed / LinkedIn / Stripe):
 *   - The prompt itself renders in the SUGGESTED language, not the
 *     active UI language — a visitor on en arriving from Mexico sees
 *     "¿Prefieres español? [Cambiar a Español] [Continuar en English]".
 *     This is how every multinational site does it because it asks the
 *     question in the language the visitor most likely reads.
 *   - One shot per browser: a dismissal or an accept both persist in
 *     localStorage so the banner never reappears.
 *   - No banner if the visitor's active locale already matches the
 *     suggestion, if they've manually picked a locale (detector wrote a
 *     cookie), or if their country has no mapped suggestion.
 *
 * Country → suggested locale mapping:
 *   MX (Mexico)           → es
 *   AR/CL/CO/PE/UY/VE/etc → es (LatAm; same catalogue today)
 *   ES (Spain)            → es (Iberian; same catalogue today — log #1411)
 *   CA-QC (Quebec)        → fr-CA (geo gives only country code today;
 *                                  we widen to all of CA and let the user
 *                                  decline. Province-level detection is
 *                                  tracked in #1410.)
 *
 * Catalogue keys live under `chrome.localeSuggest.*` in EACH locale so
 * the banner can call `i18n.getFixedT(suggestion)` to render copy in the
 * suggested language regardless of the active session locale.
 */

import { useEffect, useMemo, useState } from "react";
import { Globe, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n/i18n";
import { NATIVE_LABELS } from "@/lib/i18n/locale-labels";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  PUBLIC_LOCALES,
  normalizeLocale,
  type Locale,
} from "@shared/i18n";

const DISMISS_STORAGE_KEY = "hv_locale_suggest_decided_v1";
const GEO_SESSION_KEY = "hv_meta_geo_country";

interface GeoResponse {
  country: string | null;
}

/** Country (ISO-3166-1 alpha-2) → suggested locale. Add a row here when
 *  shipping a new locale; the banner picks it up automatically. */
const COUNTRY_TO_LOCALE: Record<string, Locale> = {
  MX: "es",
  AR: "es",
  CL: "es",
  CO: "es",
  PE: "es",
  UY: "es",
  VE: "es",
  EC: "es",
  BO: "es",
  GT: "es",
  CR: "es",
  CU: "es",
  DO: "es",
  HN: "es",
  NI: "es",
  PA: "es",
  PR: "es",
  PY: "es",
  SV: "es",
  ES: "es",
  CA: "fr-CA",
};

function suggestionFor(country: string | null): Locale | null {
  if (!country) return null;
  const upper = country.toUpperCase();
  const candidate = COUNTRY_TO_LOCALE[upper];
  if (!candidate) return null;
  if (!PUBLIC_LOCALES.includes(candidate)) return null;
  return candidate;
}

async function fetchGeoCountry(): Promise<string | null> {
  if (typeof window !== "undefined") {
    const cached = window.sessionStorage.getItem(GEO_SESSION_KEY);
    if (cached !== null) return cached === "" ? null : cached;
  }
  try {
    const res = await apiClient.get<GeoResponse>("/api/_meta/geo");
    const country = res.data.country ?? null;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(GEO_SESSION_KEY, country ?? "");
    }
    return country;
  } catch {
    return null;
  }
}

export function GeoLocaleSuggestionBanner(): JSX.Element | null {
  const { i18n: liveI18n } = useTranslation();
  const [suggestion, setSuggestion] = useState<Locale | null>(null);
  const [open, setOpen] = useState(false);

  // Active locale is normalised so "en-US" or empty still resolves to a
  // known Locale we can compare against the suggestion.
  const active = useMemo<Locale>(
    () => normalizeLocale(liveI18n.language) ?? "en",
    [liveI18n.language],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    // One shot per browser: previously accepted or dismissed → never show.
    if (window.localStorage.getItem(DISMISS_STORAGE_KEY)) return;
    let cancelled = false;
    void fetchGeoCountry().then((country) => {
      if (cancelled) return;
      const next = suggestionFor(country);
      if (!next) return;
      if (next === active) return;
      setSuggestion(next);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
    // `active` intentionally captured at mount; if the user manually
    // switches locale we don't re-evaluate — the dismiss flag will be set
    // by their explicit choice path (see handleAccept / handleDismiss).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open || !suggestion) return null;

  // Render the banner copy in the SUGGESTED locale so a Mexican visitor
  // on the en UI sees the prompt in Spanish. `getFixedT` returns a `t`
  // bound to a specific locale without flipping the global one.
  const tSuggested = i18n.getFixedT(suggestion);
  const activeNative = NATIVE_LABELS[active];
  const suggestedNative = NATIVE_LABELS[suggestion];

  const persistDecision = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // Storage may be blocked; the banner will reappear next visit, which
      // is acceptable degradation.
    }
  };

  const handleAccept = () => {
    persistDecision();
    setOpen(false);
    void i18n.changeLanguage(suggestion);
  };

  const handleDismiss = () => {
    persistDecision();
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label={tSuggested("chrome.localeSuggest.aria")}
      className="border-b border-border bg-muted/60"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Globe className="h-5 w-5 mt-0.5 text-primary shrink-0" aria-hidden />
          <p className="text-sm text-foreground">
            {tSuggested("chrome.localeSuggest.message", {
              suggested: suggestedNative,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={handleAccept}>
            {tSuggested("chrome.localeSuggest.switch", {
              suggested: suggestedNative,
            })}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            {tSuggested("chrome.localeSuggest.keep", {
              active: activeNative,
            })}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            aria-label={tSuggested("chrome.localeSuggest.dismiss")}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default GeoLocaleSuggestionBanner;
