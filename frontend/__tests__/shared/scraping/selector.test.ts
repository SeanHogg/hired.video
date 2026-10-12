/**
 * DOM-based tests for @shared/scraping/selector.ts.
 *
 * Single source of truth for both formFields.ts (autofill) and the
 * Chrome-extension picker (content-script-picker.ts). The DRY
 * extraction in 0103 collapsed two parallel implementations into
 * this module — these tests pin the contract so future edits can't
 * quietly re-diverge.
 *
 * Runs under Vitest's jsdom environment, same as formFields.test.ts.
 */

import { describe, it, expect } from "vitest";
import { cssEscape, buildSelector } from "@shared/scraping/selector.ts";

function dom(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html",
  );
}

describe("cssEscape", () => {
  it("escapes embedded double-quotes", () => {
    expect(cssEscape('hello"world')).toBe('hello\\"world');
  });
  it("escapes backslashes", () => {
    expect(cssEscape("a\\b")).toBe("a\\\\b");
  });
  it("escapes newlines + carriage returns + form feeds", () => {
    expect(cssEscape("a\nb")).toBe("a\\\nb");
    expect(cssEscape("a\rb")).toBe("a\\\rb");
    expect(cssEscape("a\fb")).toBe("a\\\fb");
  });
  it("leaves safe characters alone", () => {
    expect(cssEscape("foo-bar_baz123")).toBe("foo-bar_baz123");
  });
});

describe("buildSelector — anchor preference", () => {
  it("prefers id over chain", () => {
    const doc = dom(`<div><span id="job-title">Engineer</span></div>`);
    const el = doc.getElementById("job-title")!;
    expect(buildSelector(doc as any, el as any)).toBe("#job-title");
  });

  it("prefers name attribute when no usable id", () => {
    const doc = dom(`<form><input name="email" type="email"></form>`);
    const el = doc.querySelector('input[name="email"]')!;
    expect(buildSelector(doc as any, el as any)).toBe('input[name="email"]');
  });

  it("skips numeric-leading ids and falls back to chain", () => {
    // CSS regards #1foo as invalid without escaping; the regex anchors
    // on an alpha leading char so numeric ids are skipped intentionally.
    const doc = dom(`<div><span id="1numeric">x</span></div>`);
    const el = doc.getElementById("1numeric")!;
    const sel = buildSelector(doc as any, el as any);
    expect(sel).not.toBe("#1numeric");
    expect(sel).toMatch(/span/);
  });
});

describe("buildSelector — chain walk", () => {
  it("uses nth-of-type when siblings of the same tag exist", () => {
    const doc = dom(`
      <article>
        <p>first</p>
        <p>second</p>
        <p>third</p>
      </article>
    `);
    const targets = doc.querySelectorAll("article > p");
    const sel = buildSelector(doc as any, targets[1] as any);
    expect(sel).toMatch(/p:nth-of-type\(2\)/);
  });

  it("omits nth-of-type when an element is the only one of its tag", () => {
    const doc = dom(`<section><h1>Title</h1><p>body</p></section>`);
    const h1 = doc.querySelector("h1")!;
    const sel = buildSelector(doc as any, h1 as any);
    expect(sel).toBe("section > h1");
    expect(sel).not.toMatch(/nth-of-type/);
  });

  it("anchors on an ancestor id when found mid-walk", () => {
    const doc = dom(`<div id="container"><section><span>x</span></section></div>`);
    const span = doc.querySelector("span")!;
    const sel = buildSelector(doc as any, span as any);
    expect(sel).toMatch(/^#container/);
    expect(sel).toMatch(/span/);
  });

  it("caps chain depth (no 20-segment selectors)", () => {
    let html = "<span>leaf</span>";
    for (let i = 0; i < 12; i++) html = `<div>${html}</div>`;
    const doc = dom(html);
    const leaf = doc.querySelector("span")!;
    const sel = buildSelector(doc as any, leaf as any, { maxDepth: 6 });
    const segments = sel.split(" > ");
    expect(segments.length).toBeLessThanOrEqual(6);
  });
});

describe("buildSelector — does not use class names (LinkedIn safety)", () => {
  it("never emits a class selector even when classes are present", () => {
    // LinkedIn ships randomised class names with every deploy.
    // The picker MUST NOT depend on them — selectors would rot in hours.
    const doc = dom(`
      <div class="jobs-search__job-details--container">
        <h1 class="ember-view-4239 t-24">Senior Engineer</h1>
      </div>
    `);
    const h1 = doc.querySelector("h1")!;
    const sel = buildSelector(doc as any, h1 as any);
    expect(sel).not.toMatch(/\./);
    expect(sel).not.toMatch(/ember-view/);
  });
});
