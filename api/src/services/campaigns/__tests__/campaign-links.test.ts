/**
 * #1972 — campaign click-tracking link helpers.
 *
 * Pins the sign/verify round-trip, the open-redirect guard (a forged or
 * mismatched signature fails verify), the non-http(s) skip, and the body
 * link-rewrite (trackable anchors rewritten through the signed redirect;
 * mailto:, anchors, and our own tracking/consent endpoints left untouched).
 *
 * Crypto runs for real (Web Crypto HMAC keyed by JWT_SECRET).
 *
 * Run: node --import tsx --test src/services/campaigns/__tests__/campaign-links.test.ts
 */
import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";

import {
  buildClickUrl,
  isTrackableTarget,
  rewriteLinksForClickTracking,
  signClickTarget,
  verifyClickTarget,
} from "../campaign-links.js";

const RID = "11111111-1111-1111-1111-111111111111";
const BASE = "https://hired.video";

before(() => {
  process.env.JWT_SECRET = "test-campaign-click-secret";
});

describe("campaign click links", () => {
  it("isTrackableTarget only accepts absolute http(s)", () => {
    assert.equal(isTrackableTarget("https://example.com/x"), true);
    assert.equal(isTrackableTarget("http://example.com"), true);
    assert.equal(isTrackableTarget("mailto:a@b.com"), false);
    assert.equal(isTrackableTarget("#anchor"), false);
    assert.equal(isTrackableTarget("/relative"), false);
    assert.equal(isTrackableTarget("javascript:alert(1)"), false);
  });

  it("sign/verify round-trips for the same recipient + target", async () => {
    const target = "https://hired.video/jobs?utm=campaign";
    const sig = await signClickTarget(RID, target);
    assert.equal(await verifyClickTarget(RID, target, sig), true);
  });

  it("rejects a signature minted for a different target (open-redirect guard)", async () => {
    const sig = await signClickTarget(RID, "https://hired.video/a");
    assert.equal(
      await verifyClickTarget(RID, "https://evil.example/phish", sig),
      false,
    );
  });

  it("rejects a signature minted for a different recipient", async () => {
    const target = "https://hired.video/a";
    const sig = await signClickTarget(RID, target);
    const other = "22222222-2222-2222-2222-222222222222";
    assert.equal(await verifyClickTarget(other, target, sig), false);
  });

  it("rejects an empty / garbage signature", async () => {
    const target = "https://hired.video/a";
    assert.equal(await verifyClickTarget(RID, target, ""), false);
    assert.equal(await verifyClickTarget(RID, target, "deadbeef"), false);
  });

  it("buildClickUrl produces a verifiable round-trip from its own query", async () => {
    const target = "https://hired.video/pricing?ref=email";
    const url = await buildClickUrl(BASE, RID, target);
    const parsed = new URL(url);
    assert.equal(parsed.pathname, `/api/campaigns/click/${RID}`);
    const u = parsed.searchParams.get("u")!;
    const s = parsed.searchParams.get("s")!;
    assert.equal(u, target);
    assert.equal(await verifyClickTarget(RID, u, s), true);
  });

  it("rewrites trackable anchors but leaves non-http(s) + own endpoints alone", async () => {
    const html = [
      `<a href="https://hired.video/jobs">Jobs</a>`,
      `<a href='http://example.com/x'>x</a>`,
      `<a href="mailto:hi@hired.video">Email</a>`,
      `<a href="#top">Top</a>`,
      `<a href="https://hired.video/api/campaigns/open/abc.png">px</a>`,
      `<a href="https://hired.video/api/email/unsubscribe/tok">Unsub</a>`,
    ].join("\n");

    const out = await rewriteLinksForClickTracking(html, RID, BASE);

    // Trackable links now point at the click redirect.
    assert.ok(out.includes(`/api/campaigns/click/${RID}?u=`));
    assert.ok(out.includes(encodeURIComponent("https://hired.video/jobs")));
    assert.ok(out.includes(encodeURIComponent("http://example.com/x")));
    // Quote style preserved for the single-quoted anchor.
    assert.ok(out.includes(`href='https://hired.video/api/campaigns/click/`));

    // Untouched: mailto, anchor, and our own tracking/consent endpoints.
    assert.ok(out.includes(`href="mailto:hi@hired.video"`));
    assert.ok(out.includes(`href="#top"`));
    assert.ok(out.includes(`href="https://hired.video/api/campaigns/open/abc.png"`));
    assert.ok(out.includes(`href="https://hired.video/api/email/unsubscribe/tok"`));

    // Every rewritten target verifies against its emitted signature.
    for (const m of out.matchAll(/\/api\/campaigns\/click\/[^?]+\?u=([^&]+)&s=([^"']+)/g)) {
      const target = decodeURIComponent(m[1]);
      assert.equal(await verifyClickTarget(RID, target, m[2]), true);
    }
  });

  it("is a no-op on link-free html", async () => {
    const html = "<p>no links here</p>";
    assert.equal(await rewriteLinksForClickTracking(html, RID, BASE), html);
  });
});
