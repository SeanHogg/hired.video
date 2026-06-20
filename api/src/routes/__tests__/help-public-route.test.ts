/**
 * help public-route classification unit tests.
 *
 * The context-aware help surface (routes/help.ts) serves mapping + search
 * META only and its read handlers never touch c.var.user. The HelpDrawer
 * renders for anonymous visitors on public pages, so the meta reads must be
 * reachable logged-out: GET /contexts, GET /resolve, GET /search. These were
 * not in the app.ts auth allowlist, so resolveAccessMode fell through to
 * "authenticated" and the global authMiddleware 401'd every anonymous caller
 * (the bug this fixes — GET /api/help/contexts returned 401 Unauthorized).
 *
 * This mirrors the HELP_PUBLIC_READ_ROUTE regex from app.ts so a refactor
 * can't silently re-gate the public meta reads or, worse, widen the
 * exemption to the SuperAdmin curation subroutes (/mappings, /reindex).
 *
 * Keep the regex copy below in sync with app.ts.
 *
 * Run: node --test routes/__tests__/help-public-route.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Mirror of HELP_PUBLIC_READ_ROUTE in app.ts. Gated to GET in resolveAccessMode.
const HELP_PUBLIC_READ_ROUTE = /^\/api\/help\/(?:contexts|resolve|search)(?:$|\?)/;

describe("HELP_PUBLIC_READ_ROUTE", () => {
  it("matches the active-context membership read", () => {
    assert.ok(HELP_PUBLIC_READ_ROUTE.test("/api/help/contexts"));
  });

  it("matches the per-context resolve read (with query string)", () => {
    assert.ok(HELP_PUBLIC_READ_ROUTE.test("/api/help/resolve"));
    assert.ok(HELP_PUBLIC_READ_ROUTE.test("/api/help/resolve?context=studio-editor"));
  });

  it("matches the semantic-search read (with query string)", () => {
    assert.ok(HELP_PUBLIC_READ_ROUTE.test("/api/help/search"));
    assert.ok(HELP_PUBLIC_READ_ROUTE.test("/api/help/search?q=export+video"));
  });

  it("does NOT match the SuperAdmin curation subroutes (stay authenticated)", () => {
    assert.equal(HELP_PUBLIC_READ_ROUTE.test("/api/help/mappings"), false);
    assert.equal(
      HELP_PUBLIC_READ_ROUTE.test("/api/help/mappings/65584442-f7e9-42bb-a253-63fbdfac2b3a"),
      false,
    );
    assert.equal(HELP_PUBLIC_READ_ROUTE.test("/api/help/reindex"), false);
  });

  it("does NOT match unrelated or prefix-colliding paths", () => {
    assert.equal(HELP_PUBLIC_READ_ROUTE.test("/api/help"), false);
    assert.equal(HELP_PUBLIC_READ_ROUTE.test("/api/help/contexts-admin"), false);
    assert.equal(HELP_PUBLIC_READ_ROUTE.test("/api/helpdesk/contexts"), false);
  });
});
