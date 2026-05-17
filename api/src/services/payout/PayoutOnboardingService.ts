/**
 * PayoutOnboardingService — orchestrates rail-specific onboarding flows
 * and writes the resulting provider account reference back to
 * payout_profiles. The flow is:
 *
 *   1. startSession(provider, returnUrl)
 *        → routes/payouts.ts:POST /me/onboarding/start
 *        → provider.startOnboardingSession()
 *        → returns DTO the frontend uses to mount the hosted widget
 *          (helcim_ach) or to confirm the recipient email (tremendous)
 *
 *   2. completeSession(provider, providerAccountId, hint)
 *        → routes/payouts.ts:POST /me/onboarding/complete
 *        → validates the account reference shape (email | bankToken | text)
 *        → writes provider + provider_account_id + payouts_enabled=true
 *          on payout_profiles
 *        → captures the UI hint (last4, bankName) so the dashboard can
 *          render "Bank ····1234" without re-fetching from the provider
 *
 *   3. getStatus(userId)
 *        → returns the current rail + masked hint + payouts_enabled flag
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getPayoutProvider } from "./index.js";
import type {
  ActivePayoutProvider,
  PayoutOnboardingSessionDTO,
  PayoutOnboardingCompleteInput,
} from "../../../../shared/payout-profile.js";

const { payoutProfiles } = schema;

export interface PayoutOnboardingStatus {
  provider: ActivePayoutProvider | null;
  providerAccountId: string | null;
  accountHint: { last4?: string; bankName?: string; accountType?: string } | null;
  payoutsEnabled: boolean;
  onboardedAt: string | null;
}

export class PayoutOnboardingService {
  async startSession(
    userId: string,
    provider: ActivePayoutProvider,
    successUrl: string,
    cancelUrl: string,
    env: Record<string, string | undefined>,
  ): Promise<PayoutOnboardingSessionDTO> {
    if (provider === "manual") {
      // Manual rail has no remote widget; the frontend goes straight to
      // /complete with a free-text reference.
      return { provider, flowType: "manual" };
    }
    const client = getPayoutProvider(provider, env);
    const session = await client.startOnboardingSession(userId, successUrl, cancelUrl);
    return {
      provider,
      flowType: session.flowType,
      checkoutToken: session.checkoutToken,
      sdkScriptUrl: session.sdkScriptUrl,
      helcimJsConfig: session.helcimJsConfig,
    };
  }

  async completeSession(
    userId: string,
    input: PayoutOnboardingCompleteInput,
  ): Promise<PayoutOnboardingStatus> {
    const accountId = input.providerAccountId?.trim();
    if (!accountId) {
      throw new Error("providerAccountId is required");
    }
    if (input.provider === "tremendous" && !/^[^@]+@[^@]+\.[^@]+$/.test(accountId)) {
      throw new Error("tremendous providerAccountId must be a valid email address");
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(payoutProfiles)
      .where(eq(payoutProfiles.userId, userId))
      .limit(1);
    const baseRow =
      existing ??
      (
        await db
          .insert(payoutProfiles)
          .values({ userId })
          .returning()
      )[0];

    const now = new Date();
    const [updated] = await db
      .update(payoutProfiles)
      .set({
        payoutProvider: input.provider,
        payoutAccountId: accountId,
        accountHint: input.hint ?? null,
        payoutsEnabled: true,
        payoutOnboardedAt: baseRow.payoutOnboardedAt ?? now,
        updatedAt: now,
      })
      .where(eq(payoutProfiles.userId, userId))
      .returning();

    return this.statusFromRow(updated);
  }

  async getStatus(userId: string): Promise<PayoutOnboardingStatus> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(payoutProfiles)
      .where(eq(payoutProfiles.userId, userId))
      .limit(1);
    if (!row) {
      return {
        provider: null,
        providerAccountId: null,
        accountHint: null,
        payoutsEnabled: false,
        onboardedAt: null,
      };
    }
    return this.statusFromRow(row);
  }

  /**
   * Admin-only: disable payouts for a user without dropping the stored
   * provider account. Used when a payout fails repeatedly (e.g. bank
   * closed) so the next ledger accrual doesn't immediately queue another
   * doomed transfer.
   */
  async disablePayouts(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(payoutProfiles)
      .set({ payoutsEnabled: false, updatedAt: new Date() })
      .where(eq(payoutProfiles.userId, userId));
  }

  private statusFromRow(row: typeof payoutProfiles.$inferSelect): PayoutOnboardingStatus {
    const provider = row.payoutProvider as ActivePayoutProvider | null;
    return {
      provider,
      providerAccountId: row.payoutAccountId ?? null,
      accountHint: row.accountHint ?? null,
      payoutsEnabled: row.payoutsEnabled,
      onboardedAt: row.payoutOnboardedAt ? new Date(row.payoutOnboardedAt).toISOString() : null,
    };
  }
}

export const payoutOnboardingService = new PayoutOnboardingService();
