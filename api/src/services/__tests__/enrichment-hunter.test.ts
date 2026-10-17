/**
 * Unit tests for the Hunter.io enrichment provider (#1758). Pure helpers
 * (URL build, name split, domain resolve, response map) are tested
 * directly; the HTTP path is tested against a stubbed global `fetch`.
 *
 * Run: node --import tsx --test src/services/__tests__/enrichment-hunter.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  HunterEnrichmentProvider,
  buildHunterUrl,
  mapHunterData,
  resolveDomain,
} from "../enrichment/hunter.js";
import { splitPersonName } from "../../../../shared/person-name.js";

const realFetch = globalThis.fetch;
const realKey = process.env.HUNTER_API_KEY;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.HUNTER_API_KEY;
  else process.env.HUNTER_API_KEY = realKey;
});

describe("splitPersonName (Hunter's final-token mode)", () => {
  const split = (n: string | undefined) => splitPersonName(n, { lastName: "final" });
  it("handles empty, single, and multi-part names", () => {
    assert.deepEqual(split(undefined), { firstName: "", lastName: "" });
    assert.deepEqual(split("Cher"), { firstName: "Cher", lastName: "" });
    assert.deepEqual(split("Ada Lovelace"), { firstName: "Ada", lastName: "Lovelace" });
    assert.deepEqual(split("Mary Anne Evans"), { firstName: "Mary", lastName: "Evans" });
  });
  it("default rest mode keeps middle names in lastName; emptyFirstName fills blanks", () => {
    assert.deepEqual(splitPersonName("Mary Anne Evans"), { firstName: "Mary", lastName: "Anne Evans" });
    assert.deepEqual(splitPersonName("   ", { emptyFirstName: "Unknown" }), { firstName: "Unknown", lastName: "" });
    assert.deepEqual(splitPersonName(null), { firstName: "", lastName: "" });
  });
});

describe("resolveDomain", () => {
  it("prefers explicit domain, then a domain-shaped company, else null", () => {
    assert.equal(resolveDomain({ domain: "acme.com" }), "acme.com");
    assert.equal(resolveDomain({ company: "acme.io" }), "acme.io");
    assert.equal(resolveDomain({ company: "Acme Inc" }), null);
    assert.equal(resolveDomain({}), null);
  });
});

describe("buildHunterUrl", () => {
  it("includes api_key, domain and split name params", () => {
    const url = buildHunterUrl({ name: "Ada Lovelace", domain: "acme.com" }, "KEY123");
    assert.match(url, /^https:\/\/api\.hunter\.io\/v2\/email-finder\?/);
    assert.match(url, /api_key=KEY123/);
    assert.match(url, /domain=acme\.com/);
    assert.match(url, /first_name=Ada/);
    assert.match(url, /last_name=Lovelace/);
  });

  it("falls back to company param when no domain is resolvable", () => {
    const url = buildHunterUrl({ name: "Ada", company: "Acme Inc" }, "K");
    assert.match(url, /company=Acme\+Inc/);
    assert.doesNotMatch(url, /domain=/);
  });
});

describe("mapHunterData", () => {
  it("maps a populated data object and marks enriched when an email is found", () => {
    const r = mapHunterData(
      { name: "Ada Lovelace", domain: "acme.com" },
      {
        email: "ada@acme.com",
        first_name: "Ada",
        last_name: "Lovelace",
        position: "Engineer",
        company: "Acme",
        domain: "acme.com",
        linkedin_url: "https://linkedin.com/in/ada",
        phone_number: "+1555",
      },
    );
    assert.equal(r.email, "ada@acme.com");
    assert.equal(r.title, "Engineer");
    assert.equal(r.linkedInUrl, "https://linkedin.com/in/ada");
    assert.equal(r.phone, "+1555");
    assert.equal(r.enriched, true);
  });

  it("degrades to enriched:false on an empty/garbage shape", () => {
    assert.equal(mapHunterData({ email: "x@y.com" }, null).enriched, false);
    assert.equal(mapHunterData({}, { email: "" }).enriched, false);
    // Existing input email is preserved as a fallback even when not enriched.
    assert.equal(mapHunterData({ email: "keep@me.com" }, {}).email, "keep@me.com");
  });
});

describe("HunterEnrichmentProvider.enrich", () => {
  it("reports config-missing (no throw) when HUNTER_API_KEY is absent", async () => {
    delete process.env.HUNTER_API_KEY;
    globalThis.fetch = (() => {
      throw new Error("fetch should not be called without a key");
    }) as any;
    const out = await new HunterEnrichmentProvider().enrich({ name: "Ada", domain: "acme.com" });
    assert.equal(out.result.enriched, false);
    assert.match(out.responseExcerpt ?? "", /not configured/i);
  });

  it("parses a 200 and returns an enriched result", async () => {
    process.env.HUNTER_API_KEY = "KEY";
    let calledUrl = "";
    globalThis.fetch = (async (url: string) => {
      calledUrl = url;
      return new Response(
        JSON.stringify({ data: { email: "ada@acme.com", first_name: "Ada", domain: "acme.com" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;
    const out = await new HunterEnrichmentProvider().enrich({ name: "Ada Lovelace", domain: "acme.com" });
    assert.match(calledUrl, /email-finder\?.*domain=acme\.com/);
    assert.equal(out.result.email, "ada@acme.com");
    assert.equal(out.result.enriched, true);
    assert.equal(out.httpStatus, 200);
  });

  it("maps a 4xx error body to an honest non-enriched result", async () => {
    process.env.HUNTER_API_KEY = "KEY";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errors: [{ code: "wrong_params", details: "bad domain" }] }), {
        status: 400,
      })) as any;
    const out = await new HunterEnrichmentProvider().enrich({ name: "Ada", domain: "x" });
    assert.equal(out.result.enriched, false);
    assert.equal(out.httpStatus, 400);
    assert.match(out.responseExcerpt ?? "", /bad domain/);
  });

  it("swallows a network throw into a non-enriched result", async () => {
    process.env.HUNTER_API_KEY = "KEY";
    globalThis.fetch = (async () => {
      throw new Error("ECONNRESET");
    }) as any;
    const out = await new HunterEnrichmentProvider().enrich({ name: "Ada", domain: "acme.com" });
    assert.equal(out.result.enriched, false);
    assert.match(out.errorMessage ?? "", /ECONNRESET/);
  });
});
