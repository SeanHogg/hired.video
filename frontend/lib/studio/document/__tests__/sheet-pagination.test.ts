/**
 * Reflow into discrete page sheets (#1934(1)): the pagination math.
 * Geometry is shaped like the kit's Letter résumé page (816 × 1056 px at
 * 96 dpi, the print page's 0.5in = 48px margin as the flow's padding).
 *
 * Run: vitest run lib/studio/document/__tests__/sheet-pagination.test.ts
 */
import { describe, expect, it } from "vitest";
import { mergeBands, paginateBlocks, type SheetBlock } from "../sheet-pagination";

const PAGE = 1056;

/** Blocks stacked from `top`, each `height` tall, `gap` apart. */
function stack(top: number, heights: number[], gap = 0): SheetBlock[] {
  const out: SheetBlock[] = [];
  let y = top;
  for (const h of heights) {
    out.push({ top: y, height: h });
    y += h + gap;
  }
  return out;
}

describe("paginateBlocks", () => {
  it("empty content is one blank page", () => {
    expect(paginateBlocks([], PAGE)).toEqual([{ start: 0, end: 0, clipped: false, offset: 0 }]);
    expect(paginateBlocks([], PAGE, { contentHeight: 96 })).toEqual([{ start: 0, end: 96, clipped: false, offset: 0 }]);
  });

  it("an exact fit stays on one page", () => {
    const blocks = stack(0, [256, 400, 400]); // 1056 exactly
    const pages = paginateBlocks(blocks, PAGE, { contentHeight: 1056 });
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ start: 0, end: 1056, clipped: false });
  });

  it("a block one pixel over the limit moves whole to the next page", () => {
    const blocks = stack(0, [256, 400, 401]); // last block ends at 1057
    const pages = paginateBlocks(blocks, PAGE, { contentHeight: 1057 });
    expect(pages).toHaveLength(2);
    // Break exactly at the block boundary — never through the block.
    expect(pages[0]).toMatchObject({ start: 0, end: 656, clipped: false });
    expect(pages[1]).toMatchObject({ start: 656, end: 1057, clipped: false });
  });

  it("a block taller than a page gets its own page, clipped, and the flow resumes after it", () => {
    const blocks = [{ top: 0, height: 300 }, { top: 300, height: 1500 }, { top: 1800, height: 200 }];
    const pages = paginateBlocks(blocks, PAGE, { contentHeight: 2000 });
    expect(pages).toEqual([
      { start: 0, end: 300, clipped: false, offset: 0 },
      { start: 300, end: 300 + PAGE, clipped: true, offset: 0 },
      { start: 1800, end: 2000, clipped: false, offset: 0 },
    ]);
  });

  it("an oversized last block leaves no blank page behind it", () => {
    const pages = paginateBlocks([{ top: 0, height: 2400 }], PAGE, { contentHeight: 2400 });
    expect(pages).toEqual([{ start: 0, end: PAGE, clipped: true, offset: 0 }]);
  });

  it("never breaks between side-by-side columns (sidebar beside the main column)", () => {
    // Main column entries 48→1148 (breakable at 348 / 648 / 948 alone); the
    // sidebar's skills block spans 600→1000, across the 648 and 948 edges.
    const main = stack(48, [300, 300, 300, 200]);
    const sidebar = [{ top: 600, height: 400 }];
    const alone = paginateBlocks(main, PAGE, { contentHeight: 1196, insetTop: 48, insetBottom: 48 });
    expect(alone[0]).toMatchObject({ start: 0, end: 948 });
    const pages = paginateBlocks([...main, ...sidebar], PAGE, { contentHeight: 1196, insetTop: 48, insetBottom: 48 });
    // 348→1148 is one band now; it can't end above 1008 (1056 − 48 margin).
    expect(pages).toEqual([
      { start: 0, end: 348, clipped: false, offset: 0 },
      { start: 348, end: 1196, clipped: false, offset: 48 },
    ]);
  });

  it("later pages keep the flow's margin as their inset", () => {
    const blocks = stack(48, Array.from({ length: 12 }, () => 180), 0); // 48 → 2208
    const pages = paginateBlocks(blocks, PAGE, { contentHeight: 2256, insetTop: 48, insetBottom: 48 });
    // Page 1 fits 5 blocks (48 + 900 = 948 ≤ 1008); later pages fit 5 in 960.
    expect(pages.map((p) => [p.start, p.end, p.offset])).toEqual([
      [0, 948, 0],
      [948, 1848, 48],
      [1848, 2256, 48],
    ]);
    for (const p of pages.slice(1)) expect(p.end - p.start + p.offset).toBeLessThanOrEqual(PAGE - 48);
  });

  it("a bad page height never throws", () => {
    expect(paginateBlocks(stack(0, [100]), 0)).toHaveLength(1);
    expect(paginateBlocks([{ top: Number.NaN, height: 10 }], PAGE)).toHaveLength(1);
  });
});

describe("mergeBands", () => {
  it("merges overlapping blocks and drops empty ones", () => {
    expect(
      mergeBands([
        { top: 100, height: 50 },
        { top: 0, height: 40 },
        { top: 120, height: 100 },
        { top: 300, height: 0 },
      ]),
    ).toEqual([
      { top: 0, height: 40 },
      { top: 100, height: 120 },
    ]);
  });
});
