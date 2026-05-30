/**
 * #809 — paid extra-inbox slots above the 3 included with Pro.
 *
 * Reads / writes `inbox_seat_addons` and is the only seam the rest of
 * the codebase calls to learn "how many extra inboxes did this user pay
 * for?". The entitlement-catalog dispatcher (gap #1361 follow-on)
 * doesn't yet know about paid expansions — until it does, we expose
 * `getEffectiveInboxCap(userId)` which the cap-check in
 * routes/email-integration.ts uses to compute the real ceiling.
 *
 * Stripe / Helcim subscription-line synchronisation is intentionally
 * pluggable: `updateAddonQuantity()` writes the local row, then calls
 * `syncSubscriptionQuantity()` which today is a no-op stub. When the
 * billing-provider abstraction grows a `setSubscriptionQuantity()`
 * method the stub becomes a real call without touching callers.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "../../../../shared/pricing.js";

const { inboxSeatAddons } = schema;

export interface InboxAddonState {
  quantity: number;
  unitPriceCents: number;
  monthlyTotalCents: number;
  effectiveCap: number;
  status: "active" | "cancelled" | "past_due";
}

const PRICE_CENTS = Math.round(INBOX_SYNC_EXTRA_ACCOUNT_PRICE * 100);
const MAX_QUANTITY = 50;

export class InboxSeatAddonService {
  async getState(userId: string): Promise<InboxAddonState> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(inboxSeatAddons)
      .where(eq(inboxSeatAddons.userId, userId))
      .limit(1);

    const qty = row?.status === "active" ? row.quantity : 0;
    const unitPrice = row?.unitPriceCents ?? PRICE_CENTS;

    return {
      quantity: qty,
      unitPriceCents: unitPrice,
      monthlyTotalCents: qty * unitPrice,
      effectiveCap: INBOX_SYNC_INCLUDED_ACCOUNTS + qty,
      status: (row?.status as InboxAddonState["status"] | undefined) ?? "active",
    };
  }

  async getEffectiveCap(userId: string): Promise<number> {
    const state = await this.getState(userId);
    return state.effectiveCap;
  }

  /**
   * Upsert the user's addon row to `quantity`. Returns the new
   * effective cap. Callers are responsible for the upstream payment
   * collection — this method assumes the provider has already accepted
   * the subscription-quantity change.
   */
  async setQuantity(userId: string, quantity: number): Promise<InboxAddonState> {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      throw new Error(`quantity must be an integer in [0, ${MAX_QUANTITY}]`);
    }
    const db = getDb();
    const now = new Date();

    await db
      .insert(inboxSeatAddons)
      .values({
        userId,
        quantity,
        unitPriceCents: PRICE_CENTS,
        status: "active",
      })
      .onConflictDoUpdate({
        target: inboxSeatAddons.userId,
        set: {
          quantity,
          unitPriceCents: sql`COALESCE(${inboxSeatAddons.unitPriceCents}, ${PRICE_CENTS})`,
          status: "active",
          updatedAt: now,
        },
      });

    // Provider sync intentionally separated — see file header.
    await this.syncSubscriptionQuantity(userId, quantity);

    return this.getState(userId);
  }

  async cancel(userId: string): Promise<void> {
    const db = getDb();
    await db
      .update(inboxSeatAddons)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(inboxSeatAddons.userId, userId));
    await this.syncSubscriptionQuantity(userId, 0);
  }

  // ---------------------------------------------------------------------
  // Provider sync stub — see file header.
  // ---------------------------------------------------------------------
  private async syncSubscriptionQuantity(_userId: string, _quantity: number): Promise<void> {
    // Wire-in pending billing-provider abstraction work. Local row is
    // authoritative for entitlement checks; provider sync is a billing
    // concern that's separately observable via `billing_events`.
  }
}

export const inboxSeatAddonService = new InboxSeatAddonService();
