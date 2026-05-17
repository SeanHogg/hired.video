import { apiClient } from "@/lib/api-client";
import type {
  ActivePayoutProvider,
  PayoutBalanceDTO,
  PayoutOnboardingSessionDTO,
  PayoutOnboardingCompleteInput,
} from "@shared/payout-profile";

export type {
  ActivePayoutProvider,
  PayoutBalanceDTO,
  PayoutOnboardingSessionDTO,
  PayoutOnboardingCompleteInput,
} from "@shared/payout-profile";
export { ACTIVE_PAYOUT_PROVIDERS, isActivePayoutProvider } from "@shared/payout-profile";

export interface PayoutOnboardingStatus {
  provider: ActivePayoutProvider | null;
  providerAccountId: string | null;
  accountHint: { last4?: string; bankName?: string; accountType?: string } | null;
  payoutsEnabled: boolean;
  onboardedAt: string | null;
}

export const payoutService = {
  async getBalance(): Promise<PayoutBalanceDTO> {
    const res = await apiClient.get<PayoutBalanceDTO>("/api/payouts/me/balance");
    return res.data;
  },

  async getOnboardingStatus(): Promise<PayoutOnboardingStatus> {
    const res = await apiClient.get<PayoutOnboardingStatus>("/api/payouts/me/onboarding/status");
    return res.data;
  },

  async startOnboarding(
    provider: ActivePayoutProvider,
    opts?: { successUrl?: string; cancelUrl?: string },
  ): Promise<PayoutOnboardingSessionDTO> {
    const res = await apiClient.post<PayoutOnboardingSessionDTO>(
      "/api/payouts/me/onboarding/start",
      { provider, ...opts },
    );
    return res.data;
  },

  async completeOnboarding(input: PayoutOnboardingCompleteInput): Promise<PayoutOnboardingStatus> {
    const res = await apiClient.post<PayoutOnboardingStatus>(
      "/api/payouts/me/onboarding/complete",
      input,
    );
    return res.data;
  },
};
