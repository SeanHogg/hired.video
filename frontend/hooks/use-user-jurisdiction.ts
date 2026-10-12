/**
 * useUserJurisdiction — single source of truth for "which legal jurisdiction
 * applies to this visitor right now?" Consumers (PrivacyPolicy, ToS,
 * CookiePolicy, jurisdictional section components, regional consent flows)
 * read this directly and self-gate per the DRY rule — never prop-drill a
 * `canShowGdprSection` boolean a consumer could compute itself.
 *
 * Resolution chain (highest priority first):
 *   1. Explicit URL `?as=<jurisdiction>` override — for legal review +
 *      user self-service ("show me what an EU user sees")
 *   2. Authenticated user's billing_address.country + state — best signal
 *      we have today for "where do they actually live"
 *   3. Cloudflare geo-IP via /api/_meta/geo — anonymous-visitor fallback
 *   4. "ROW" (rest of world) — generic notice if nothing else resolved
 *
 * The resolved jurisdiction + its source surfaces back to the consumer so
 * the "viewing as ..." selector can label whether the user is seeing their
 * own jurisdiction or an override.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api-client";
import {
  buildJurisdiction,
  type Jurisdiction,
  type JurisdictionSource,
} from "@shared/jurisdictions";

const GEO_CACHE_KEY = "hv_meta_geo_country";

interface GeoResponse {
  country: string | null;
}

async function fetchGeoCountry(): Promise<string | null> {
  if (typeof window !== "undefined") {
    const cached = window.sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) return cached === "" ? null : cached;
  }
  try {
    const res = await apiClient.get<GeoResponse>("/api/_meta/geo");
    const country = res.data.country ?? null;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(GEO_CACHE_KEY, country ?? "");
    }
    return country;
  } catch {
    return null;
  }
}

export interface UseUserJurisdictionApi {
  jurisdiction: Jurisdiction;
  source: JurisdictionSource;
  /** Set/clear the URL `?as=...` override. Null clears it. */
  setOverride: (j: Jurisdiction | null) => void;
}

export function useUserJurisdiction(): UseUserJurisdictionApi {
  const { user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [geoCountry, setGeoCountry] = useState<string | null>(null);
  const [geoLoaded, setGeoLoaded] = useState(false);

  // Geo-IP fan-out only matters when the user isn't authenticated AND
  // hasn't overridden via URL. Skip the fetch otherwise to keep page
  // loads cheap.
  useEffect(() => {
    if (isAuthenticated) {
      setGeoLoaded(true);
      return;
    }
    if (searchParams.get("as")) {
      setGeoLoaded(true);
      return;
    }
    let cancelled = false;
    void fetchGeoCountry().then((country) => {
      if (cancelled) return;
      setGeoCountry(country);
      setGeoLoaded(true);
    });
    return () => { cancelled = true; };
  }, [isAuthenticated, searchParams]);

  const setOverride = useCallback(
    (j: Jurisdiction | null) => {
      const next = new URLSearchParams(searchParams);
      if (j) next.set("as", j);
      else next.delete("as");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return useMemo<UseUserJurisdictionApi>(() => {
    const overrideParam = searchParams.get("as")?.trim();
    if (overrideParam) {
      return { jurisdiction: overrideParam, source: "url_override", setOverride };
    }

    // billing_address.country / state is the strongest signal we can
    // surface today. The User type doesn't carry a dedicated `country`
    // field yet (added in EU phase / #1152) — fall back to billing.
    const billingCountry = (user as any)?.billingCountry as string | undefined;
    const billingState = (user as any)?.billingState as string | undefined;
    if (billingCountry) {
      return {
        jurisdiction: buildJurisdiction(billingCountry, billingState),
        source: "billing_address",
        setOverride,
      };
    }

    if (!geoLoaded) {
      // First render before the geo fetch resolves — return a defensive
      // ROW so any section that requires a US/CA/EEA jurisdiction stays
      // hidden until we know better.
      return { jurisdiction: "ROW", source: "fallback", setOverride };
    }
    if (geoCountry) {
      return {
        jurisdiction: buildJurisdiction(geoCountry, null),
        source: "geo_ip",
        setOverride,
      };
    }
    return { jurisdiction: "ROW", source: "fallback", setOverride };
  }, [searchParams, user, geoLoaded, geoCountry, setOverride]);
}
