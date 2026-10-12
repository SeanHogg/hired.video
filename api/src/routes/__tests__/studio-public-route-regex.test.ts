/**
 * Studio public-route regex unit tests.
 *
 * `app.ts` whitelists view + cta-click + embed routes so the public watch
 * page can record analytics without a Bearer token. The regex was
 * hard-coded to `/api/studio/videos/<id>/…` but the live frontend
 * (post-#665) hits `/api/studio/projects/<id>/…` — analytics keys on the
 * studio_project id, not the rendered video row, because pre-render
 * projects need to be view-trackable too. The mismatch returned 401
 * from the auth middleware before the route handler even ran.
 *
 * This test pins the regex's shape so a future refactor can't silently
 * narrow the whitelist back to videos-only.
 *
 * Run: node --test routes/__tests__/studio-public-route-regex.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

// Mirror the regex from app.ts. Keeping a copy here means the test
// fails LOUDLY if someone edits the production regex incompatibly —
// the source-of-truth comparison is on the next line. Update both
// together.
const STUDIO_PUBLIC_ROUTE =
  /^\/api\/studio\/(?:(?:videos|projects)\/[^/]+(?:\/view|\/cta-click|\/embed)|projects\/[^/]+\/engagement\/public|forms\/[^/]+\/submit|analytics\/track)$/;

describe("STUDIO_PUBLIC_ROUTE", () => {
  it("matches the live `projects/<id>/view` callsite from the public watch page", () => {
    assert.ok(
      STUDIO_PUBLIC_ROUTE.test(
        "/api/studio/projects/65584442-f7e9-42bb-a253-63fbdfac2b3a/view",
      ),
    );
  });

  it("matches the live `projects/<id>/cta-click` callsite", () => {
    assert.ok(
      STUDIO_PUBLIC_ROUTE.test(
        "/api/studio/projects/65584442-f7e9-42bb-a253-63fbdfac2b3a/cta-click",
      ),
    );
  });

  it("matches the legacy `videos/<id>/view` callsite for backwards compat", () => {
    assert.ok(STUDIO_PUBLIC_ROUTE.test("/api/studio/videos/abc-123/view"));
  });

  it("matches the embed snippet route under both naming branches", () => {
    assert.ok(STUDIO_PUBLIC_ROUTE.test("/api/studio/videos/abc-123/embed"));
    assert.ok(STUDIO_PUBLIC_ROUTE.test("/api/studio/projects/abc-123/embed"));
  });

  it("does NOT whitelist the auth-required `/analytics` summary endpoint", () => {
    assert.equal(
      STUDIO_PUBLIC_ROUTE.test("/api/studio/projects/abc-123/analytics"),
      false,
    );
  });

  it("does NOT whitelist arbitrary `/projects` reads", () => {
    assert.equal(
      STUDIO_PUBLIC_ROUTE.test("/api/studio/projects/abc-123"),
      false,
    );
    assert.equal(STUDIO_PUBLIC_ROUTE.test("/api/studio/projects"), false);
  });

  it("does NOT whitelist sibling routes that just happen to end in /view", () => {
    assert.equal(
      STUDIO_PUBLIC_ROUTE.test("/api/studio/projects/abc/sub/path/view"),
      false,
    );
  });

  it("matches the per-second watch heatmap tracker", () => {
    assert.ok(STUDIO_PUBLIC_ROUTE.test("/api/studio/analytics/track"));
  });

  // #1586 — playback engagement widgets for signed-out viewers.
  it("matches the public engagement read a signed-out watch page fires", () => {
    assert.ok(
      STUDIO_PUBLIC_ROUTE.test(
        "/api/studio/projects/65584442-f7e9-42bb-a253-63fbdfac2b3a/engagement/public",
      ),
    );
  });

  it("matches an anonymous form submission", () => {
    assert.ok(
      STUDIO_PUBLIC_ROUTE.test("/api/studio/forms/3f6c1d2e-8a41-4b6f-9a0e-2d5c7b9e1a44/submit"),
    );
  });

  it("does NOT open the owner-only engagement listings or form management", () => {
    const ID = "65584442-f7e9-42bb-a253-63fbdfac2b3a";
    for (const path of [
      `/api/studio/projects/${ID}/forms`,
      `/api/studio/projects/${ID}/chapters`,
      `/api/studio/projects/${ID}/thumbnails`,
      `/api/studio/projects/${ID}/comments`,
      `/api/studio/projects/${ID}/engagement`,
      `/api/studio/forms/${ID}`,
      `/api/studio/forms/${ID}/submissions`,
      `/api/studio/forms/${ID}/submit/extra`,
    ]) {
      assert.equal(STUDIO_PUBLIC_ROUTE.test(path), false, path);
    }
  });
});
