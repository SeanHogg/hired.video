/** The letter's free elements in its print / Word HTML (letter-overlays.ts),
 *  through the real builder (cover-letter-export.ts). */
import { describe, expect, it } from "vitest";
import type { ResumeContent } from "@shared/resume";
import type { CoverLetter } from "@shared/cover-letter";
import { coverLetterHtml } from "@/lib/cover-letter-export";
import {
  hasLetterOverlays,
  letterOverlayCss,
  letterOverlayHtml,
  paginateBlocks,
  planWordPages,
  splitAtWord,
  wordPagedBody,
} from "../letter-overlays";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const PNG2 = "data:image/png;base64,AAAA";
const SHEET = { pageWidthIn: 8.27, pageHeightIn: 11.69 };

const CONTENT = { basics: { name: "Sean Hogg", email: "sean@example.com" } } as unknown as ResumeContent;
const LETTER = {
  jobTitle: "Chief Information Officer",
  organization: "Macomb Community College",
  recipientLines: ["Search Committee"],
  date: "2026-10-04",
  salutation: "Dear Search Committee,",
  opening: ["I am applying for the CIO role."],
  highlightsIntro: "",
  highlights: [],
  closing: ["Thank you for your time."],
  signOff: "Sincerely,",
  style: { font: "serif", size: 11, spacing: "normal", paper: "a4" },
} as unknown as CoverLetter;

/** Page of each anchored picture in a Word body, by order of appearance. */
const anchorsOf = (html: string) => html.split('<p class="anchor"').slice(1);

describe("letter overlays (print)", () => {
  it("ignores empty pages and anything that isn't our PNG", () => {
    expect(hasLetterOverlays(undefined)).toBe(false);
    expect(hasLetterOverlays([null, "javascript:alert(1)", "data:image/svg+xml,<svg/>"])).toBe(false);
    expect(letterOverlayHtml([null, '"><script>'], SHEET)).toBe("");
    expect(letterOverlayCss([null], "print")).toBe("");
  });

  it("moves the margin into the body and places page N at N sheets down", () => {
    const html = letterOverlayHtml([null, PNG], SHEET);
    expect(html).toContain("top:11.690in");
    expect(html).toContain("width:8.27in");
    expect(letterOverlayCss([PNG], "print")).toContain("@page { margin: 0; }");
    expect(letterOverlayCss([PNG], "word")).toBe("");
  });
});

describe("planWordPages", () => {
  const H = 1000;
  it("puts each block on the page it starts on", () => {
    const plan = planWordPages(
      [
        { top: 0, bottom: 400 },
        { top: 420, bottom: 980 },
        { top: 1000, bottom: 1300 },
        { top: 1320, bottom: 2150 },
        { top: 2170, bottom: 2300 },
      ],
      H,
    );
    expect(plan.pageOf).toEqual([0, 0, 1, 1, 2]);
    // Block 2 follows one that ended on page 0: forced. Block 4 follows a
    // block split across the boundary: Word is already on page 2.
    expect(plan.breakBefore).toEqual([false, false, true, false, false]);
  });

  it("is one page with no height to go by", () => {
    expect(planWordPages([{ top: 0, bottom: 5000 }], 0).pageOf).toEqual([0]);
  });
});

describe("wordPagedBody", () => {
  const blocks = ["<p>a</p>", "<p>b</p>", "<p>c</p>", "<ul><li>d</li></ul>"];
  const plan = { pageOf: [0, 0, 1, 1], breakBefore: [false, false, true, false] };

  it("anchors each page's picture before the block that starts that page, at the page's corner", () => {
    const html = wordPagedBody(blocks, plan, [PNG, PNG2], SHEET);
    const anchors = anchorsOf(html);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toContain(PNG);
    expect(anchors[1]).toContain(PNG2);
    expect(anchors[1]).toContain("page-break-before:always");
    expect(html.indexOf(PNG2)).toBeLessThan(html.indexOf("<p>c</p>"));
    expect(html.indexOf(PNG2)).toBeGreaterThan(html.indexOf("<p>b</p>"));
    for (const a of anchors) {
      expect(a).toContain("mso-position-vertical-relative:page");
      expect(a).toContain("top:0");
    }
  });

  it("keeps forced breaks on pages without a picture", () => {
    const html = wordPagedBody(blocks, plan, [PNG], SHEET);
    expect(anchorsOf(html)[1]).toContain("page-break-before:always");
    expect(anchorsOf(html)[1]).not.toContain("<img");
  });

  it("adds pages for elements below the letter's end", () => {
    const html = wordPagedBody(blocks, plan, [null, null, null, PNG], SHEET);
    const anchors = anchorsOf(html);
    // page-1 break, then page 2 (empty), then page 3 with the picture.
    expect(anchors).toHaveLength(3);
    expect(anchors.every((a) => a.includes("page-break-before:always"))).toBe(true);
    expect(anchors[2]).toContain(PNG);
  });
});

describe("coverLetterHtml", () => {
  it("leaves a letter without elements as it was", () => {
    const plain = coverLetterHtml(LETTER, CONTENT, "October 4, 2026");
    expect(plain).not.toContain("overlay");
    expect(plain).not.toContain("anchor");
    expect(plain).toContain("margin: 0.9in");
    expect(plain).toContain("sean@example.com");
  });

  it("print carries the pictures; Word anchors them on explicit pages", () => {
    const print = coverLetterHtml(LETTER, CONTENT, "October 4, 2026", { overlays: [PNG], target: "print" });
    expect(print).toContain(`<img src="${PNG}"`);
    expect(print).toContain("Dear Search Committee,");
    const word = coverLetterHtml(LETTER, CONTENT, "October 4, 2026", { overlays: [PNG], target: "word" });
    expect(anchorsOf(word)[0]).toContain(PNG);
    expect(word).toContain("margin: 0.9in");
    expect(word.indexOf(PNG)).toBeLessThan(word.indexOf("Dear Search Committee,"));
  });
});

describe("splitAtWord", () => {
  it("splits at the last space before the first line that falls past the page", () => {
    expect(splitAtWord("one two three four", 9)).toEqual(["one two", "three four"]);
    expect(splitAtWord("unbreakable", 4)).toEqual(["unbr", "eakable"]);
    expect(splitAtWord("text", 0)).toBeNull();
    expect(splitAtWord("text", -1)).toBeNull();
    expect(splitAtWord("text", 4)).toBeNull();
  });
});

describe("paginateBlocks", () => {
  // A fake laid-out letter: "L<n>" is a paragraph of n 20px lines, stacked.
  const LINE = 20;
  const lines = (b: string) => Number(b.slice(1));
  const measurer = {
    rects(blocks: readonly string[]) {
      let y = 0;
      return blocks.map((b) => {
        const top = y;
        y += lines(b) * LINE;
        return { top, bottom: y };
      });
    },
    split(blocks: readonly string[], i: number, at: number) {
      const top = this.rects(blocks)[i].top;
      const fit = Math.floor((at - top) / LINE);
      const n = lines(blocks[i]);
      return fit > 0 && fit < n ? ([`L${fit}`, `L${n - fit}`] as [string, string]) : null;
    },
  };

  it("splits a paragraph spanning a whole page so every page starts with its own block", () => {
    // 1000px pages; the second paragraph runs 40..2440: across two boundaries.
    const { blocks, plan } = paginateBlocks(["L2", "L120", "L3"], measurer, 1000);
    expect(blocks).toEqual(["L2", "L48", "L50", "L22", "L3"]);
    expect(plan.pageOf).toEqual([0, 0, 1, 2, 2]);
    expect(plan.breakBefore).toEqual([false, false, true, true, false]);
    // Each page now has a block that starts it: Word anchors every picture on its page.
    const html = wordPagedBody(blocks, plan, [PNG, PNG2, PNG], SHEET);
    expect(html.split("<img").length - 1).toBe(3);
  });

  it("leaves a block it can't split and goes on", () => {
    const stubborn = { ...measurer, split: () => null };
    const { blocks, plan } = paginateBlocks(["L60", "L10"], stubborn, 1000);
    expect(blocks).toEqual(["L60", "L10"]);
    expect(plan.pageOf).toEqual([0, 1]);
  });
});
