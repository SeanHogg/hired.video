/**
 * Candidate-screening route wiring + portal access-mode tests.
 *
 * The whole screening backend (routes/screening.ts, services/screening/*,
 * migration 0191) shipped, and the frontend (lib/services/screening-service.ts
 * + the built dist bundle) already calls `/api/recruit/screening/*` and
 * `/api/public/screening/*` — but `createApp()` never imported or mounted
 * `screeningRoutes` / `screeningPublicRoutes`. Every call therefore 404'd, so
 * the recruiter template builder, the send flow, and the candidate magic-link
 * portal were all dead. This guards against that regression recurring:
 *
 *   1. the two `app.route(...)` mounts + the import are present in app.ts, and
 *   2. the SCREENING_PORTAL_ROUTE carve-out classifies the candidate portal as
 *      optional-auth (anonymous token holders can view; a present JWT binds the
 *      request to the signed-in user) WITHOUT widening to the recruiter surface
 *      (which must stay authenticated).
 *
 * Keep the regex copy below in sync with app.ts.
 *
 * Run: node --import tsx --test src/routes/__tests__/screening-route-wiring.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_TS = resolve(HERE, "..", "..", "app.ts");

// Mirror of SCREENING_PORTAL_ROUTE in app.ts. Classified as optional-auth.
const SCREENING_PORTAL_ROUTE = /^\/api\/public\/screening(?:\/|$)/;

describe("SCREENING_PORTAL_ROUTE", () => {
  it("matches the portal view, claim, and satisfy paths", () => {
    const token = "k1m2n3o4p5q6r7s8t9u0v1w2x3y4z5a6";
    assert.ok(SCREENING_PORTAL_ROUTE.test(`/api/public/screening/${token}`));
    assert.ok(SCREENING_PORTAL_ROUTE.test(`/api/public/screening/${token}/claim`));
    assert.ok(
      SCREENING_PORTAL_ROUTE.test(
        `/api/public/screening/${token}/items/abc-123/satisfy`,
      ),
    );
    // Trailing query string still matches.
    assert.ok(SCREENING_PORTAL_ROUTE.test(`/api/public/screening/${token}?x=1`));
  });

  it("does NOT match the recruiter surface (must stay authenticated)", () => {
    assert.equal(SCREENING_PORTAL_ROUTE.test("/api/recruit/screening/catalog"), false);
    assert.equal(SCREENING_PORTAL_ROUTE.test("/api/recruit/screening/templates"), false);
    assert.equal(SCREENING_PORTAL_ROUTE.test("/api/recruit/screening/requests"), false);
  });

  it("does NOT match a different /api/public sibling", () => {
    assert.equal(SCREENING_PORTAL_ROUTE.test("/api/public/pitch-deck/abc"), false);
    assert.equal(SCREENING_PORTAL_ROUTE.test("/api/public/candidate-resume/abc"), false);
  });
});

describe("app.ts screening wiring", () => {
  const src = readFileSync(APP_TS, "utf8");

  it("imports both screening route sub-apps", () => {
    assert.match(src, /screeningRoutes/);
    assert.match(src, /screeningPublicRoutes/);
    assert.match(src, /from "\.\/routes\/screening\.js"/);
  });

  it("mounts the recruiter surface at /api/recruit/screening", () => {
    assert.match(
      src,
      /app\.route\(\s*"\/api\/recruit\/screening"\s*,\s*screeningRoutes\s*\)/,
    );
  });

  it("mounts the candidate portal at /api/public/screening", () => {
    assert.match(
      src,
      /app\.route\(\s*"\/api\/public\/screening"\s*,\s*screeningPublicRoutes\s*\)/,
    );
  });

  it("classifies the portal as optional-auth (not in PUBLIC_PREFIXES)", () => {
    // The carve-out must route through optional-auth so a present JWT binds the
    // request; a "public" classification would never attach the user.
    assert.match(src, /SCREENING_PORTAL_ROUTE\.test\(path\)\)\s*return "optional-auth"/);
    // Guard against someone adding it to PUBLIC_PREFIXES instead.
    const prefixesBlock = src.slice(
      src.indexOf("const PUBLIC_PREFIXES"),
      src.indexOf("];", src.indexOf("const PUBLIC_PREFIXES")),
    );
    assert.equal(prefixesBlock.includes("/api/public/screening"), false);
  });
});
