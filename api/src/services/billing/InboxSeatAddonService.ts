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
 * Provider (Stripe / Helcim) subscription-line synchronisation is
 * intentionally decoupled: `setQuantity()` / `cancel()` write the local
 * row (authoritative for entitlement checks) and then record an
 * `inbox_seat_quantity_synced` row in `billing_events`. That durable
 * audit row is the canonical change-stream a billing-provider connector
 * job consumes to push the new quantity upstream — the same pattern the
 * workforce seat reconciler (#1409/#1424) uses. The provider push itself
 * is tracked as a follow-on (it needs a per-addon provider subscription
 * line id, which `inbox_seat_addons` does not yet carry — see register).
 */

import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "../../../../shared/pricing.js";

const { inboxSeatAddons, billingEvents } = schema;

type Db = ReturnType<typeof getDb>;

/** Optional dependency override so the service is unit-testable against the
 *  fake-db harness without a live connection. */
export interface InboxSeatAddonDeps {
  db?: Db;
}

export interface InboxAddonState {
  quantity: number;
  unitPriceCents: number;
  monthlyTotalCents: number;
  effectiveCap: number;
  status: "active" | "cancelled" | "past_due";
}

const PRICE_CENTS = Math.round(INBOX_SYNC_EXTRA_ACCOUNT_PRICE * 100);
const MAX_QUANTITY = 50;

/** billing_events.event_type emitted on every addon quantity change. */
export const INBOX_SEAT_SYNC_EVENT = "inbox_seat_quantity_synced";

export class InboxSeatAddonService {
  private resolveDb(deps?: InboxSeatAddonDeps): Db {
    return deps?.db ?? getDb();
  }

  async getState(userId: string, deps?: InboxSeatAddonDeps): Promise<InboxAddonState> {
    const db = this.resolveDb(deps);
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

  async getEffectiveCap(userId: string, deps?: InboxSeatAddonDeps): Promise<number> {
    const state = await this.getState(userId, deps);
    return state.effectiveCap;
  }

  /**
   * Upsert the user's addon row to `quantity`. Returns the new
   * effective cap. Callers are responsible for the upstream payment
   * collection — this method assumes the provider has already accepted
   * the subscription-quantity change.
   */
  async setQuantity(userId: string, quantity: number, deps?: InboxSeatAddonDeps): Promise<InboxAddonState> {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      throw new Error(`quantity must be an integer in [0, ${MAX_QUANTITY}]`);
    }
    const db = this.resolveDb(deps);
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

    const state = await this.getState(userId, deps);
    await this.recordSyncEvent(userId, state, db);
    return state;
  }

  async cancel(userId: string, deps?: InboxSeatAddonDeps): Promise<void> {
    const db = this.resolveDb(deps);
    await db
      .update(inboxSeatAddons)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(inboxSeatAddons.userId, userId));
    // After cancellation getState() reports quantity 0 (status !== active),
    // so the audit row records the effective drop to zero.
    const state = await this.getState(userId, deps);
    await this.recordSyncEvent(userId, state, db);
  }

  // ---------------------------------------------------------------------
  // Durable change-stream audit — see file header. Writes a billing_events
  // row a provider-sync connector consumes. Best-effort: a failed audit
  // insert must not fail the entitlement write (the local row is
  // authoritative), so we swallow + log.
  // ---------------------------------------------------------------------
  private async recordSyncEvent(userId: string, state: InboxAddonState, db: Db): Promise<void> {
    try {
       
      await (db.insert(billingEvents) as any).values({
        userId,
        eventType: INBOX_SEAT_SYNC_EVENT,
        payload: {
          quantity: state.quantity,
          unitPriceCents: state.unitPriceCents,
          monthlyTotalCents: state.monthlyTotalCents,
          effectiveCap: state.effectiveCap,
        },
      });
    } catch (err) {
      console.warn(`[billing] inbox-seat sync audit failed for ${userId}:`, err);
    }
  }
}

export const inboxSeatAddonService = new InboxSeatAddonService();
