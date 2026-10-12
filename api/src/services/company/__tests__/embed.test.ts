/**
 * Embed runtime — origin allowlist logic + surface-catalog integrity. The
 * full resolveEmbedRequest path is integration-level (DB + segment resolution)
 * and is exercised end-to-end; here we lock the pure logic + the catalog
 * invariants the loader/snippet depend on.
 *
 * Run: node --import tsx --test src/services/company/__tests__/embed.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { originAllowed, buildEmbedSnippet } from "../embed.js";
import {
  EMBED_SURFACES,
  EMBED_VIEWS,
  EMBED_VIEW_KEYS,
  EMBED_KEY_PLACEHOLDER,
} from "../../../../../shared/embed.js";

describe("originAllowed", () => {
  it("allows any origin when no allowlist is configured", () => {
    assert.equal(originAllowed("https://acme.com", []), true);
    assert.equal(originAllowed(null, []), true);
  });
  it("rejects a missing origin once an allowlist exists", () => {
    assert.equal(originAllowed(null, ["https://acme.com"]), false);
  });
  it("matches case- and trailing-slash-insensitively", () => {
    assert.equal(originAllowed("https://Acme.com/", ["https://acme.com"]), true);
    assert.equal(originAllowed("https://evil.com", ["https://acme.com"]), false);
  });
});

describe("embed surface catalog", () => {
  it("every available view has a unique scope", () => {
    const scopes = EMBED_VIEWS.map((v) => v.scope);
    assert.equal(new Set(scopes).size, scopes.length);
    for (const v of EMBED_VIEWS) assert.ok(v.scope.startsWith("people:"));
  });
  it("EMBED_VIEW_KEYS are exactly the available surfaces", () => {
    assert.deepEqual(
      [...EMBED_VIEW_KEYS].sort(),
      EMBED_SURFACES.filter((s) => s.status === "available").map((s) => s.key).sort(),
    );
  });
  it("every surface key is unique across the catalog", () => {
    const keys = EMBED_SURFACES.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("buildEmbedSnippet", () => {
  it("embeds the env-var placeholder, never a real key, and names the view", () => {
    const snip = buildEmbedSnippet("acme-co", "roster");
    assert.ok(snip.includes(EMBED_KEY_PLACEHOLDER), "uses the env-var placeholder");
    assert.ok(snip.includes('data-hired-company="acme-co"'));
    assert.ok(snip.includes('data-hired-view="roster"'));
    assert.ok(snip.includes("/embed/v1/loader.js"));
    assert.ok(/never|NEVER/.test(snip), "carries the don't-hardcode warning");
  });
});
