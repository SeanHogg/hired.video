/**
 * InboxSeatAddonService (#809) — local-row entitlement math + the durable
 * `billing_events` audit row that a provider-sync connector consumes (the
 * header's "separately observable via billing_events" promise that used to
 * be a silent no-op stub).
 *
 * Covers:
 *   • setQuantity     — upserts the addon row, returns the right effective
 *                        cap / monthly total, and emits ONE
 *                        `inbox_seat_quantity_synced` audit row
 *   • setQuantity x2  — second call updates the same row (no duplicate addon)
 *                        and emits a second audit row reflecting the new qty
 *   • cancel          — flips status to cancelled and audits the drop to 0
 *   • validation      — non-integer / out-of-range quantity throws
 *
 * Run: node --import tsx --test src/services/__tests__/inbox-seat-addon.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import {
  InboxSeatAddonService,
  INBOX_SEAT_SYNC_EVENT,
} from "../billing/InboxSeatAddonService.js";
import { INBOX_SYNC_INCLUDED_ACCOUNTS, INBOX_SYNC_EXTRA_ACCOUNT_PRICE } from "../../../../shared/pricing.js";

const UNIT_CENTS = Math.round(INBOX_SYNC_EXTRA_ACCOUNT_PRICE * 100); // 500

function makeDeps(seed: { inboxSeatAddons?: any[]; billingEvents?: any[] } = {}) {
  const fake = buildFakeDb({
    inbox_seat_addons: seed.inboxSeatAddons ?? [],
    billing_events: seed.billingEvents ?? [],
  });
  const state = fake.state as any;
  return {
    db: fake.db,
    addons: () => state.inbox_seat_addons as any[],
    events: () => state.billing_events as any[],
  };
}

describe("InboxSeatAddonService.setQuantity", () => {
  it("upserts the addon row and returns the correct cap + monthly total", async () => {
    const { db, addons } = makeDeps();
    const svc = new InboxSeatAddonService();

    const state = await svc.setQuantity("user-1", 4, { db });

    assert.equal(state.quantity, 4);
    assert.equal(state.unitPriceCents, UNIT_CENTS);
    assert.equal(state.monthlyTotalCents, 4 * UNIT_CENTS); // $20/mo
    assert.equal(state.effectiveCap, INBOX_SYNC_INCLUDED_ACCOUNTS + 4);
    assert.equal(addons().length, 1);
    assert.equal(addons()[0].quantity, 4);
    assert.equal(addons()[0].status, "active");
  });

  it("emits exactly one inbox_seat_quantity_synced billing_events audit row", async () => {
    const { db, events } = makeDeps();
    const svc = new InboxSeatAddonService();

    await svc.setQuantity("user-1", 4, { db });

    const audit = events().filter((e) => e.eventType === INBOX_SEAT_SYNC_EVENT);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].userId, "user-1");
    assert.deepEqual(audit[0].payload, {
      quantity: 4,
      unitPriceCents: UNIT_CENTS,
      monthlyTotalCents: 4 * UNIT_CENTS,
      effectiveCap: INBOX_SYNC_INCLUDED_ACCOUNTS + 4,
    });
  });

  it("a second setQuantity updates the same addon row (no duplicate) and audits the new qty", async () => {
    const { db, addons, events } = makeDeps();
    const svc = new InboxSeatAddonService();

    await svc.setQuantity("user-1", 2, { db });
    await svc.setQuantity("user-1", 5, { db });

    assert.equal(addons().length, 1, "still one addon row after re-setting quantity");
    assert.equal(addons()[0].quantity, 5);

    // One audit row per change; the second reflects the new quantity. (We
    // don't assert the price-derived total here: the fake-db can't evaluate
    // the COALESCE() in the upsert SET, so unitPriceCents isn't numeric on the
    // merge path — that arithmetic is covered by the single-call case above,
    // which exercises the real numeric value.)
    const audit = events().filter((e) => e.eventType === INBOX_SEAT_SYNC_EVENT);
    assert.equal(audit.length, 2);
    assert.equal(audit[1].payload.quantity, 5);
  });

  it("rejects a non-integer or out-of-range quantity", async () => {
    const { db } = makeDeps();
    const svc = new InboxSeatAddonService();
    await assert.rejects(() => svc.setQuantity("user-1", 1.5, { db }), /integer/);
    await assert.rejects(() => svc.setQuantity("user-1", -1, { db }), /integer/);
    await assert.rejects(() => svc.setQuantity("user-1", 51, { db }), /integer/);
  });
});

describe("InboxSeatAddonService.cancel", () => {
  it("flips status to cancelled and audits the effective drop to zero", async () => {
    const { db, addons, events } = makeDeps({
      inboxSeatAddons: [
        { id: "a1", userId: "user-1", quantity: 3, unitPriceCents: UNIT_CENTS, status: "active" },
      ],
    });
    const svc = new InboxSeatAddonService();

    await svc.cancel("user-1", { db });

    assert.equal(addons()[0].status, "cancelled");
    const audit = events().filter((e) => e.eventType === INBOX_SEAT_SYNC_EVENT);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].payload.quantity, 0); // cancelled → effective 0
    assert.equal(audit[0].payload.monthlyTotalCents, 0);
    assert.equal(audit[0].payload.effectiveCap, INBOX_SYNC_INCLUDED_ACCOUNTS);
  });
});
