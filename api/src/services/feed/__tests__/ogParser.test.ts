import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  collectMeta,
  emptyLinkPreview,
  normalizePreviewUrl,
  parseLinkPreview,
} from "../ogParser.js";

// Trimmed from a real GitHub repo page head — attribute order varies
// (`content` before `property`), entities are encoded, and twitter:* tags
// duplicate the OG ones.
const GITHUB_HEAD = `<!DOCTYPE html>
<html lang="en" data-color-mode="auto">
<head>
  <meta charset="utf-8">
  <title>GitHub - vitejs/vite: Next generation frontend tooling. It&#39;s fast!</title>
  <meta name="description" content="Next generation frontend tooling. It&#39;s fast! - vitejs/vite">
  <meta name="twitter:image" content="https://opengraph.githubassets.com/abc/vitejs/vite" />
  <meta name="twitter:site" content="@github" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="GitHub - vitejs/vite: Next generation frontend tooling. It&#39;s fast!" />
  <meta property="og:image" content="https://opengraph.githubassets.com/abc/vitejs/vite" />
  <meta property="og:image:alt" content="Next generation frontend tooling. It&#39;s fast! - vitejs/vite" />
  <meta property="og:site_name" content="GitHub" />
  <meta property="og:type" content="object" />
  <meta content="GitHub - vitejs/vite: Next generation frontend tooling. It&#39;s fast!" property="og:title" />
  <meta property="og:url" content="https://github.com/vitejs/vite" />
  <meta property="og:description" content="Next generation frontend tooling. It&#39;s fast! - vitejs/vite" />
</head>
<body><meta property="og:title" content="body microdata must not win"></body>
</html>`;

// A news-style page with single-quoted attrs, a relative og:image and
// no og:site_name.
const NEWS_HEAD = `<html><head>
<meta property='og:title' content='Hiring freeze eases as Q3 openings climb &amp; wages hold'>
<meta name='description' content='Job postings rose 4% quarter over quarter.'>
<meta property='og:image' content='/images/2026/q3-openings.jpg'>
<title>Ignored when og:title exists</title>
</head><body></body></html>`;

describe("parseLinkPreview", () => {
  it("reads OG tags regardless of attribute order and decodes entities", () => {
    const p = parseLinkPreview(GITHUB_HEAD, "https://github.com/vitejs/vite");
    assert.equal(p.url, "https://github.com/vitejs/vite");
    assert.equal(p.title, "GitHub - vitejs/vite: Next generation frontend tooling. It's fast!");
    assert.equal(p.description, "Next generation frontend tooling. It's fast! - vitejs/vite");
    assert.equal(p.imageUrl, "https://opengraph.githubassets.com/abc/vitejs/vite");
    assert.equal(p.siteName, "GitHub");
  });

  it("resolves a relative og:image and falls back to the hostname for siteName", () => {
    const p = parseLinkPreview(NEWS_HEAD, "https://www.example-news.com/business/q3-hiring");
    assert.equal(p.title, "Hiring freeze eases as Q3 openings climb & wages hold");
    assert.equal(p.description, "Job postings rose 4% quarter over quarter.");
    assert.equal(p.imageUrl, "https://www.example-news.com/images/2026/q3-openings.jpg");
    assert.equal(p.siteName, "example-news.com");
  });

  it("falls back to <title> and twitter:* when OG tags are missing", () => {
    const html = `<head><title>  Plain   page  </title>
      <meta name="twitter:description" content="From twitter">
      <meta name="twitter:image:src" content="https://cdn.example.com/t.png"></head>`;
    const p = parseLinkPreview(html, "https://example.com/");
    assert.equal(p.title, "Plain page");
    assert.equal(p.description, "From twitter");
    assert.equal(p.imageUrl, "https://cdn.example.com/t.png");
  });

  it("drops non-http(s) image URLs (javascript:, data:)", () => {
    const js = parseLinkPreview(`<meta property="og:image" content="javascript:alert(1)">`, "https://a.com");
    const data = parseLinkPreview(`<meta property="og:image" content="data:image/png;base64,AAAA">`, "https://a.com");
    assert.equal(js.imageUrl, null);
    assert.equal(data.imageUrl, null);
  });

  it("returns nulls (not empty strings) for a page with no metadata", () => {
    const p = parseLinkPreview("<html><body>hello</body></html>", "https://bare.example.org/x");
    assert.deepEqual(p, {
      url: "https://bare.example.org/x",
      title: null,
      description: null,
      imageUrl: null,
      siteName: "bare.example.org",
    });
  });

  it("clamps very long descriptions with an ellipsis", () => {
    const long = "word ".repeat(400);
    const p = parseLinkPreview(`<meta name="description" content="${long}">`, "https://a.com");
    assert.ok(p.description);
    assert.ok(p.description.length <= 500);
    assert.ok(p.description.endsWith("…"));
  });
});

describe("collectMeta", () => {
  it("keeps the first occurrence of a key (case-insensitive)", () => {
    const meta = collectMeta(`<meta property="OG:Title" content="first"><meta property="og:title" content="second">`);
    assert.equal(meta.get("og:title"), "first");
  });

  it("ignores meta tags without content", () => {
    const meta = collectMeta(`<meta charset="utf-8"><meta name="viewport">`);
    assert.equal(meta.size, 0);
  });
});

describe("normalizePreviewUrl", () => {
  it("strips fragments, tracking params and trailing slashes; sorts the query", () => {
    assert.equal(
      normalizePreviewUrl("https://Example.COM/jobs/123/?utm_source=x&b=2&fbclid=zz&a=1#apply"),
      "https://example.com/jobs/123?a=1&b=2",
    );
  });

  it("keeps the root path", () => {
    assert.equal(normalizePreviewUrl("https://example.com"), "https://example.com/");
  });

  it("returns null for non-URLs", () => {
    assert.equal(normalizePreviewUrl("not a url"), null);
    assert.equal(normalizePreviewUrl(""), null);
  });
});

describe("emptyLinkPreview", () => {
  it("carries only the URL and hostname", () => {
    assert.deepEqual(emptyLinkPreview("https://www.acme.io/a"), {
      url: "https://www.acme.io/a",
      title: null,
      description: null,
      imageUrl: null,
      siteName: "acme.io",
    });
  });
});
