/**
 * useGeoEligibility — single source of truth for "may this visitor
 * create an account?".
 *
 * Returns { eligibility, countryCode, loading } where eligibility is
 * "allowed" | "waitlist" | "sanctioned" | null (still loading).
 *
 * The Register page reads this and renders one of three states. No
 * canSignup prop drilling to children — they call the hook themselves
 * and self-decide what to show.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

const EligibilitySchema = z.object({
  countryCode: z.string().nullable(),
  eligibility: z.enum(["allowed", "waitlist", "sanctioned"]),
});

export type SignupEligibility = z.infer<typeof EligibilitySchema>["eligibility"];

export type UseGeoEligibilityApi = {
  eligibility: SignupEligibility | null;
  countryCode: string | null;
  loading: boolean;
};

export function useGeoEligibility(): UseGeoEligibilityApi {
  const [eligibility, setEligibility] = useState<SignupEligibility | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/api/security/geo/eligible", EligibilitySchema)
      .then((res) => {
        if (cancelled) return;
        setEligibility(res.data.eligibility);
        setCountryCode(res.data.countryCode);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail-open on transient errors so a flaky DoH lookup doesn't
        // block legitimate signups.
        setEligibility("allowed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { eligibility, countryCode, loading };
}
