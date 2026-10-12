import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  NO_POST_LINK,
  resolvePostLinkFields,
  toPostLinkFields,
} from "../postLinkService.js";

// Realistic job-board article head, as the composer previews it.
const OG_PAGE = `<!doctype html><html><head>
<title>Hiring: Staff Platform Engineer | Northwind Careers</title>
<meta content="Staff Platform Engineer (Remote, Canada)" property="og:title">
<meta property="og:description" content="Own our Kubernetes platform and developer tooling. CA$190k–230k + equity.">
<meta property="og:image" content="/assets/og/staff-platform.jpg">
<meta property="og:site_name" content="Northwind Careers">
</head><body><h1>Staff Platform Engineer</h1></body></html>`;

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function countingFetch(handler: () => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(typeof input === "string" ? input : input.toString());
    return handler();
  }) as typeof fetch;
  return { impl, calls };
}

describe("resolvePostLinkFields", () => {
  it("stores the server-resolved preview for a public URL", async () => {
    const { impl } = countingFetch(() => htmlResponse(OG_PAGE));
    const fields = await resolvePostLinkFields(
      "https://careers.northwind.example/jobs/staff-platform?utm_source=linkedin&utm_medium=social",
      { fetchImpl: impl },
    );
    assert.deepEqual(fields, {
      linkUrl: "https://careers.northwind.example/jobs/staff-platform",
      linkTitle: "Staff Platform Engineer (Remote, Canada)",
      linkDescription: "Own our Kubernetes platform and developer tooling. CA$190k–230k + equity.",
      linkImageUrl: "https://careers.northwind.example/assets/og/staff-platform.jpg",
    });
  });

  it("reuses the preview cache the composer warmed (no second fetch)", async () => {
    const { impl, calls } = countingFetch(() => htmlResponse(OG_PAGE));
    await resolvePostLinkFields("https://warm.northwind.example/jobs/42", { fetchImpl: impl });
    const fields = await resolvePostLinkFields("https://WARM.northwind.example/jobs/42/#apply", {
      fetchImpl: impl,
    });
    assert.equal(calls.length, 1);
    assert.equal(fields.linkTitle, "Staff Platform Engineer (Remote, Canada)");
  });

  it("stores no link for missing, non-string, unsafe or private URLs without fetching", async () => {
    const { impl, calls } = countingFetch(() => htmlResponse(OG_PAGE));
    for (const raw of [
      undefined,
      null,
      42,
      "",
      "not a url",
      "javascript:alert(document.cookie)",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost:8787/api/admin",
      "http://10.1.2.3/",
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      assert.deepEqual(await resolvePostLinkFields(raw, { fetchImpl: impl }), NO_POST_LINK, String(raw));
    }
    assert.equal(calls.length, 0);
  });

  it("falls back to the bare URL on a slow cold miss and hands the scrape to waitUntil", async () => {
    let release: (() => void) | undefined;
    const { impl } = countingFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(htmlResponse(OG_PAGE));
        }),
    );
    const kept: Array<Promise<unknown>> = [];
    const started = Date.now();
    const fields = await resolvePostLinkFields("https://slow.northwind.example/jobs/7", {
      fetchImpl: impl,
      timeoutMs: 20,
      waitUntil: (p) => kept.push(p),
    });
    assert.ok(Date.now() - started < 1_000);
    assert.deepEqual(fields, { ...NO_POST_LINK, linkUrl: "https://slow.northwind.example/jobs/7" });
    assert.equal(kept.length, 1);

    // The kept scrape completes and fills the cache for the next reader.
    release?.();
    await kept[0];
    const { impl: neverCalled, calls } = countingFetch(() => htmlResponse(""));
    const warm = await resolvePostLinkFields("https://slow.northwind.example/jobs/7", { fetchImpl: neverCalled });
    assert.equal(calls.length, 0);
    assert.equal(warm.linkTitle, "Staff Platform Engineer (Remote, Canada)");
  });

  it("survives a waitUntil that throws (no execution context)", async () => {
    const { impl } = countingFetch(() => new Promise<Response>(() => undefined));
    const fields = await resolvePostLinkFields("https://hang.northwind.example/jobs/9", {
      fetchImpl: impl,
      timeoutMs: 10,
      waitUntil: () => {
        throw new Error("This context has no ExecutionContext");
      },
    });
    assert.equal(fields.linkUrl, "https://hang.northwind.example/jobs/9");
  });
});

describe("toPostLinkFields", () => {
  it("keeps values that fit the columns and nulls an over-long image URL", () => {
    const fields = toPostLinkFields({
      url: "https://news.example.com/2026/10/layoffs-tracker",
      title: "Tech layoffs tracker — October 2026",
      description: null,
      imageUrl: `https://img.example.com/${"x".repeat(2001)}.png`,
      siteName: "Example News",
    });
    assert.equal(fields.linkTitle, "Tech layoffs tracker — October 2026");
    assert.equal(fields.linkDescription, null);
    assert.equal(fields.linkImageUrl, null);
  });

  it("drops the whole link when the URL exceeds the column", () => {
    const fields = toPostLinkFields({
      url: `https://example.com/${"p".repeat(2001)}`,
      title: "t",
      description: "d",
      imageUrl: null,
      siteName: null,
    });
    assert.deepEqual(fields, NO_POST_LINK);
  });
});
