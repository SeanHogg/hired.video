import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { getLinkPreview, MAX_HTML_BYTES, scrapeLinkPreview } from "../linkPreviewService.js";

const OG_PAGE = `<html><head>
<meta property="og:title" content="Senior Data Engineer — Remote (US)">
<meta property="og:description" content="Build streaming pipelines on Kafka + Flink.">
<meta property="og:image" content="https://cdn.jobs.example.com/og/1234.png">
<meta property="og:site_name" content="Example Jobs">
</head><body>…</body></html>`;

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });
}

/** Fake fetch that records every URL it was asked for. */
function fakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { impl, calls };
}

describe("getLinkPreview", () => {
  it("scrapes OG metadata for a public URL", async () => {
    const { impl } = fakeFetch(() => htmlResponse(OG_PAGE));
    const result = await getLinkPreview("https://jobs.example.com/view/1234?utm_source=feed", impl);
    assert.ok(result.ok);
    assert.equal(result.preview.url, "https://jobs.example.com/view/1234");
    assert.equal(result.preview.title, "Senior Data Engineer — Remote (US)");
    assert.equal(result.preview.description, "Build streaming pipelines on Kafka + Flink.");
    assert.equal(result.preview.imageUrl, "https://cdn.jobs.example.com/og/1234.png");
    assert.equal(result.preview.siteName, "Example Jobs");
  });

  it("serves a repeat (normalized-equal) URL from cache without refetching", async () => {
    const { impl, calls } = fakeFetch(() => htmlResponse(OG_PAGE));
    await getLinkPreview("https://cache-test.example.com/post/9", impl);
    await getLinkPreview("https://CACHE-TEST.example.com/post/9/#comments", impl);
    assert.equal(calls.length, 1);
  });

  it("refuses private, loopback and non-http(s) targets without fetching", async () => {
    const { impl, calls } = fakeFetch(() => htmlResponse(OG_PAGE));
    for (const url of [
      "http://127.0.0.1/admin",
      "http://localhost:8787/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://[::1]/",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "https://example.com:8443/",
      "not a url",
    ]) {
      const result = await getLinkPreview(url, impl);
      assert.equal(result.ok, false, url);
    }
    assert.equal(calls.length, 0);
  });

  it("does not follow a redirect into a private host", async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.startsWith("https://redirector.example.com")
        ? new Response(null, { status: 302, headers: { location: "http://192.168.1.1/" } })
        : htmlResponse(OG_PAGE),
    );
    const result = await getLinkPreview("https://redirector.example.com/go", impl);
    assert.ok(result.ok);
    assert.equal(result.preview.title, null);
    assert.deepEqual(calls, ["https://redirector.example.com/go"]);
  });

  it("degrades to the empty preview on a network error", async () => {
    const { impl } = fakeFetch(() => {
      throw new TypeError("network down");
    });
    const result = await getLinkPreview("https://flaky.example.com/a", impl);
    assert.ok(result.ok);
    assert.equal(result.preview.title, null);
    assert.equal(result.preview.siteName, "flaky.example.com");
  });

  it("does not cache transient (5xx) failures", async () => {
    let attempt = 0;
    const { impl, calls } = fakeFetch(() =>
      ++attempt === 1 ? new Response("oops", { status: 503 }) : htmlResponse(OG_PAGE),
    );
    const first = await getLinkPreview("https://retry.example.com/p", impl);
    const second = await getLinkPreview("https://retry.example.com/p", impl);
    assert.ok(first.ok && second.ok);
    assert.equal(first.preview.title, null);
    assert.equal(second.preview.title, "Senior Data Engineer — Remote (US)");
    assert.equal(calls.length, 2);
  });
});

describe("scrapeLinkPreview", () => {
  it("returns the empty preview for non-HTML responses", async () => {
    const { impl } = fakeFetch(() =>
      new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    const p = await scrapeLinkPreview(new URL("https://files.example.com/cv.pdf"), impl);
    assert.equal(p.title, null);
  });

  it("reads at most MAX_HTML_BYTES and still parses the head", async () => {
    const huge = OG_PAGE.replace("<body>…</body>", `<body>${"x".repeat(MAX_HTML_BYTES * 2)}</body>`);
    const { impl } = fakeFetch(() => htmlResponse(huge));
    const p = await scrapeLinkPreview(new URL("https://big.example.com/"), impl);
    assert.equal(p.title, "Senior Data Engineer — Remote (US)");
  });
});
