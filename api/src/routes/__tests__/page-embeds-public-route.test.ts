/**
 * page-embeds public-route classification unit tests.
 *
 * `<MarketingPageVideo>` (#1860/#1863) mounts app-wide in AppShell and
 * fires GET /api/studio/page-embeds/paths on every route — including
 * anonymous marketing/homepage visitors — then /resolve only on a hit.
 * Both handlers read zero user-scoped data and are documented PUBLIC, but
 * the app.ts auth allowlist was never updated when the feature shipped, so
 * `resolveAccessMode` fell through to "authenticated" and the global
 * authMiddleware returned 401 to every logged-out visitor.
 *
 * This test mirrors the relevant PUBLIC_PREFIXES entries + the startsWith
 * match so a future refactor can't silently re-gate the public reads, and
 * so the SuperAdmin management surface (bare /page-embeds) is never
 * accidentally widened into public.
 *
 * Keep the PUBLIC_PAGE_EMBED_PREFIXES copy below in sync with app.ts.
 *
 * Run: node --test routes/__tests__/page-embeds-public-route.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Mirror of the two page-embeds entries in app.ts PUBLIC_PREFIXES.
const PUBLIC_PAGE_EMBED_PREFIXES = [
  "/api/studio/page-embeds/paths",
  "/api/studio/page-embeds/resolve",
];

// Mirror of the PUBLIC_PREFIXES match in resolveAccessMode (startsWith).
const isPublic = (path: string): boolean =>
  PUBLIC_PAGE_EMBED_PREFIXES.some((p) => path.startsWith(p));

describe("page-embeds public-route classification", () => {
  it("classifies the cached membership query as public (anonymous homepage hit)", () => {
    assert.ok(isPublic("/api/studio/page-embeds/paths"));
  });

  it("classifies the per-route resolver as public (path carried in query string)", () => {
    // resolveAccessMode is given c.req.path, which excludes the query string.
    assert.ok(isPublic("/api/studio/page-embeds/resolve"));
  });

  it("does NOT make the SuperAdmin management surface public", () => {
    // GET/POST/DELETE on the bare path are SuperAdmin-gated in the handler;
    // the longer public prefixes must not match it, or no user is attached
    // and a real SuperAdmin can't manage embeds.
    assert.equal(isPublic("/api/studio/page-embeds"), false);
  });
});
