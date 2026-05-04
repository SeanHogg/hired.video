import { apiClient } from "@/lib/api-client";
import type {
  PayoutProfileDTO,
  PayoutProfileUpdateInput,
} from "@shared/payout-profile";

export type {
  PayoutProfileDTO,
  PayoutProfileUpdateInput,
  EntityType,
  TaxIdType,
  TaxFormType,
  PayoutProvider,
} from "@shared/payout-profile";
export {
  ENTITY_TYPES,
  TAX_ID_TYPES,
  TAX_FORM_TYPES,
  PAYOUT_PROVIDERS,
  deriveTaxFormType,
  isPayoutProfileComplete,
} from "@shared/payout-profile";

export const payoutService = {
  async getMine(): Promise<PayoutProfileDTO> {
    const res = await apiClient.get<PayoutProfileDTO>("/api/payouts/me");
    return res.data;
  },
  async updateMine(input: PayoutProfileUpdateInput): Promise<PayoutProfileDTO> {
    const res = await apiClient.patch<PayoutProfileDTO>("/api/payouts/me", input);
    return res.data;
  },
};
