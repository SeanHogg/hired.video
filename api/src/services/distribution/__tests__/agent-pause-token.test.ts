/** HMAC pause-link token for the posting-agent digest. */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { getJwtSecret } from "../../../utils/jwt.js";
import { buildAgentPauseUrl, mintAgentPauseToken, verifyAgentPauseToken } from "../agent-pause-token.js";
import {
  localeFromAcceptLanguage,
  pauseConfirmPage,
  pauseDonePage,
  pauseInvalidPage,
} from "../agent-pause-page.js";

describe("agent-pause-token", () => {
  const userId = "8f2c1a9e-4b7d-4e21-9c3a-1d5e6f7a8b9c";
  let prevSecret: string | undefined;
  before(() => {
    prevSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "test-secret-for-agent-pause";
  });
  after(() => {
    if (prevSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prevSecret;
  });

  it("round-trips a freshly minted token", () => {
    const token = mintAgentPauseToken(userId);
    assert.equal(verifyAgentPauseToken(token), userId);
  });

  it("rejects a tampered signature", () => {
    const token = mintAgentPauseToken(userId);
    const parts = token.split(".");
    parts[2] = "0".repeat(64);
    assert.equal(verifyAgentPauseToken(parts.join(".")), null);
  });

  it("builds a pause URL whose token round-trips", () => {
    const url = buildAgentPauseUrl("https://hired.video/", userId);
    const token = new URL(url).searchParams.get("token") ?? "";
    assert.equal(url.startsWith("https://hired.video/api/distribution/posting-agent/pause-link?"), true);
    assert.equal(verifyAgentPauseToken(token), userId);
  });

  it("rejects an expired token", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const token = mintAgentPauseToken(userId, now);
    const later = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    assert.equal(verifyAgentPauseToken(token, later), null);
  });

  it("rejects a token signed without the pause purpose prefix", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = Math.floor((now.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
    const expStr = String(exp);
    const sig = createHmac("sha256", getJwtSecret()).update(`${userId}.${expStr}`).digest("hex");
    assert.equal(verifyAgentPauseToken(`${userId}.${expStr}.${sig}`, now), null);
  });

  it("still verifies a token six days later", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const token = mintAgentPauseToken(userId, now);
    const later = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    assert.equal(verifyAgentPauseToken(token, later), userId);
  });

  it("rejects malformed tokens", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    assert.equal(verifyAgentPauseToken("", now), null);
    assert.equal(verifyAgentPauseToken("onlyonepart", now), null);
    assert.equal(verifyAgentPauseToken("a.b", now), null);
    assert.equal(verifyAgentPauseToken("a.b.c.d", now), null);
    assert.equal(verifyAgentPauseToken("user..deadbeef", now), null);
    assert.equal(verifyAgentPauseToken("user.notanumber.aa", now), null);
    assert.equal(verifyAgentPauseToken("user.123.not-hex", now), null);
  });

  it("strips a trailing slash on the origin and URL-encodes the token", () => {
    const withSlash = buildAgentPauseUrl("https://hired.video/", userId);
    const without = buildAgentPauseUrl("https://hired.video", userId);
    assert.equal(withSlash.includes("https://hired.video//"), false);
    assert.equal(without.startsWith("https://hired.video/api/distribution/posting-agent/pause-link?"), true);
    const token = new URL(without).searchParams.get("token") ?? "";
    assert.ok(token.length > 0);
    assert.equal(verifyAgentPauseToken(token), userId);
  });
});

describe("agent-pause-page", () => {
  it("maps Accept-Language to en / es / fr-CA", () => {
    assert.equal(localeFromAcceptLanguage(undefined), "en");
    assert.equal(localeFromAcceptLanguage(""), "en");
    assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9"), "en");
    assert.equal(localeFromAcceptLanguage("es-MX,es;q=0.8"), "es");
    assert.equal(localeFromAcceptLanguage("fr-CA,fr;q=0.9"), "fr-CA");
    assert.equal(localeFromAcceptLanguage("fr"), "fr-CA");
  });

  it("confirm page POSTs the token and does not auto-submit", () => {
    const token = "u.1.sig";
    const html = pauseConfirmPage(token, "en");
    assert.match(html, /method="post"/i);
    assert.match(html, /Pause agent/);
    assert.match(html, /\?token=u\.1\.sig/);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /onload=/i);
  });

  it("invalid and done pages are localized", () => {
    assert.match(pauseInvalidPage("es"), /Enlace no válido/);
    assert.match(pauseDonePage("fr-CA"), /en pause/);
  });

  it("includes a prefers-color-scheme dark block", () => {
    assert.match(pauseConfirmPage("u.1.sig", "en"), /@media \(prefers-color-scheme:\s*dark\)/);
  });
});
