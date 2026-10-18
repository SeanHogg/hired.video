/**
 * The SSE notifications hub's `since` poll cursor (services/notifications/
 * notificationFeed.ts): parsing the client's cursor into the query's lower
 * bound (with the overlap that catches late-committing inserts) and deriving
 * the cursor the client should send next.
 *
 * Run: node --import tsx --test src/services/notifications/__tests__/notification-cursor.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NOTIFICATION_CURSOR_OVERLAP_MS,
  notificationCursorFrom,
  parseNotificationCursor,
} from "../notificationFeed.js";

const NOW = new Date("2026-10-17T12:00:00.000Z");

describe("parseNotificationCursor", () => {
  it("returns null (full unread burst) when absent or unparseable", () => {
    assert.equal(parseNotificationCursor(undefined, NOW), null);
    assert.equal(parseNotificationCursor("", NOW), null);
    assert.equal(parseNotificationCursor("yesterday-ish", NOW), null);
  });

  it("subtracts the overlap from a valid cursor", () => {
    const bound = parseNotificationCursor("2026-10-17T11:58:30.250Z", NOW);
    assert.equal(bound?.toISOString(), new Date(Date.parse("2026-10-17T11:58:30.250Z") - NOTIFICATION_CURSOR_OVERLAP_MS).toISOString());
  });

  it("clamps a future cursor to now so it can't hide new rows (boundary)", () => {
    const bound = parseNotificationCursor("2027-01-01T00:00:00.000Z", NOW);
    assert.equal(bound?.getTime(), NOW.getTime() - NOTIFICATION_CURSOR_OVERLAP_MS);
  });
});

describe("notificationCursorFrom", () => {
  it("is the newest returned row's createdAt (Date or ISO string)", () => {
    const rows = [
      { createdAt: new Date("2026-10-17T11:59:59.900Z") },
      { createdAt: "2026-10-17T11:41:02.000Z" },
      { createdAt: null },
    ];
    assert.equal(notificationCursorFrom(rows, null), "2026-10-17T11:59:59.900Z");
  });

  it("round-trips the client's cursor when a cursored poll returns nothing", () => {
    const sent = "2026-10-17T11:58:30.250Z";
    const bound = parseNotificationCursor(sent, NOW);
    assert.equal(notificationCursorFrom([], bound), sent);
  });

  it("is null for an empty full burst — the next poll stays a (cheap) full burst", () => {
    assert.equal(notificationCursorFrom([], null), null);
  });
});
