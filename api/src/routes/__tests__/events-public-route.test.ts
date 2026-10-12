/**
 * events public-route classification unit tests.
 *
 * The events surface (routes/events.ts) is part of the free product, so
 * anonymous visitors must be able to browse it: GET / (search public
 * events), GET /categories, GET /slug/:slug, GET /:id. These were not in
 * the app.ts auth allowlist, so resolveAccessMode fell through to
 * "authenticated" and the global authMiddleware 401'd every logged-out
 * visitor (the bug this fixes — /api/events?scope=upcoming and
 * /api/events/categories returned 401 on the public events page).
 *
 * This mirrors the EVENTS_PUBLIC_ROUTE regex from app.ts so a refactor
 * can't silently re-gate the public reads or, worse, widen the exemption
 * to the host-only management subroutes (attendees / matches / analytics /
 * blast) or the write verbs.
 *
 * Keep the regex copy below in sync with app.ts.
 *
 * Run: node --test routes/__tests__/events-public-route.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Mirror of EVENTS_PUBLIC_ROUTE in app.ts. Gated to GET in resolveAccessMode.
const EVENTS_PUBLIC_ROUTE = /^\/api\/events(?:\/(?:slug\/[^/]+|[^/]+))?(?:$|\?)/;

describe("EVENTS_PUBLIC_ROUTE", () => {
  it("matches the discovery search (with and without query string)", () => {
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events"));
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events?scope=upcoming&limit=24"));
  });

  it("matches the category list", () => {
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events/categories"));
  });

  it("matches the public slug + single-event detail reads", () => {
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events/slug/react-meetup-2026"));
    assert.ok(
      EVENTS_PUBLIC_ROUTE.test("/api/events/65584442-f7e9-42bb-a253-63fbdfac2b3a"),
    );
  });

  it("matches /mine (single-segment) — its handler 401s anonymous callers itself", () => {
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events/mine"));
    assert.ok(EVENTS_PUBLIC_ROUTE.test("/api/events/mine?scope=past"));
  });

  it("does NOT match host-only management subroutes (stay authenticated)", () => {
    const id = "65584442-f7e9-42bb-a253-63fbdfac2b3a";
    assert.equal(EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/attendees`), false);
    assert.equal(EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/matches`), false);
    assert.equal(EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/analytics`), false);
    assert.equal(EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/blast`), false);
    assert.equal(
      EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/attendees/export.csv`),
      false,
    );
    assert.equal(
      EVENTS_PUBLIC_ROUTE.test(`/api/events/${id}/attendees/abc/approve`),
      false,
    );
  });
});
