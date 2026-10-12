/**
 * Payout provider factory.
 *
 * Returns the configured PayoutProvider for a given rail. Unlike the inbound
 * PaymentProvider (one provider per platform, selected by env var), payouts
 * support multiple rails simultaneously — each creator picks their own at
 * onboarding time. The factory dispatches by the rail key stored on
 * payout_profiles.payout_provider.
 *
 * Usage:
 *   const provider = getPayoutProvider("helcim_ach", env);
 *   const session = await provider.startOnboardingSession(...);
 */

import { HelcimAchPayoutProvider } from "./helcim-ach.js";
import { TremendousPayoutProvider } from "./tremendous.js";
import type { PayoutProvider } from "./types.js";
import type { ActivePayoutProvider } from "../../../../shared/payout-profile.js";

export * from "./types.js";

export function getPayoutProvider(
  rail: ActivePayoutProvider,
  env: Record<string, string | undefined>,
): PayoutProvider {
  switch (rail) {
    case "helcim_ach": {
      const apiToken = env.HELCIM_API_TOKEN ?? env.HELCIM_API_KEY;
      if (!apiToken) throw new Error("HELCIM_API_TOKEN is required for helcim_ach payouts");
      return new HelcimAchPayoutProvider({
        apiToken,
        webhookToken: env.HELCIM_WEBHOOK_TOKEN,
      });
    }

    case "tremendous": {
      const apiKey = env.TREMENDOUS_API_KEY;
      if (!apiKey) throw new Error("TREMENDOUS_API_KEY is required for tremendous payouts");
      return new TremendousPayoutProvider({
        apiKey,
        fundingId: env.TREMENDOUS_FUNDING_ID,
        campaignId: env.TREMENDOUS_CAMPAIGN_ID,
        webhookSecret: env.TREMENDOUS_WEBHOOK_SECRET,
        env: env.TREMENDOUS_ENV === "production" ? "production" : "sandbox",
      });
    }

    case "manual": {
      // Manual rail has no provider integration — admin moves funds
      // out-of-band and marks the payout settled via the admin route.
      throw new Error("manual rail has no provider integration; use admin API directly");
    }
  }
}

export function tryGetPayoutProvider(
  rail: ActivePayoutProvider,
  env: Record<string, string | undefined>,
): PayoutProvider | null {
  try {
    return getPayoutProvider(rail, env);
  } catch {
    return null;
  }
}
