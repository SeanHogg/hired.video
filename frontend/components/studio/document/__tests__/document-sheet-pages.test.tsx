/**
 * Discrete page sheets (#1934(1)), as rendered:
 *  - ONE pagination for every paged surface — the editor's sheets, the PDF
 *    print sheets and the read-only spread cut the same flow into the same
 *    windows;
 *  - only one window is live: every other sheet is an inert, aria-hidden
 *    copy with no focusable element and no duplicate id.
 *
 * jsdom has no layout, so the measured geometry (collectSheetBlocks) is a
 * fixture shaped like a three-page Letter résumé (1056 px pages, 48 px
 * margin): a block taller than a page lands on page 2, clipped.
 *
 * Run: vitest run components/studio/document/__tests__/document-sheet-pages.test.tsx
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { createBlankDocumentState } from "@/lib/studio/editor-v2/document-state";
import DocumentSheet from "../DocumentSheet";
import DocumentPagedView from "../DocumentPagedView";

const PAGE_W = 816;
const PAGE_H = 1056;

vi.mock("@/lib/studio/document/sheet-pagination", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/studio/document/sheet-pagination")>();
  return {
    ...actual,
    collectSheetBlocks: () => ({
      blocks: [
        { top: 48, height: 300 }, // hero
        { top: 348, height: 600 }, // experience
        { top: 948, height: 1400 }, // one table taller than a page
        { top: 2348, height: 200 }, // skills
      ],
      contentHeight: 2596,
      insetTop: 48,
      insetBottom: 48,
    }),
  };
});

/** A page body with fields, buttons and ids, like the résumé page. */
function Body() {
  return (
    <div>
      <h1 id="resume-name">Sean Hogg</h1>
      <button type="button" id="edit-work">Edit</button>
      <span tabIndex={0} contentEditable suppressContentEditableWarning data-inline-path="basics.label">
        CTO
      </span>
      <a href="https://hired.video">hired.video</a>
    </div>
  );
}

const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable]";

function windows(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-sheet-window]")).map((w) => w.getAttribute("data-sheet-window") ?? "");
}

describe("DocumentSheet pages", () => {
  it("cuts the flow at block boundaries; a too-tall block gets a clipped page of its own", () => {
    const { container, getByText } = render(
      <DocumentSheet width={PAGE_W} pageHeight={PAGE_H} zoom={1}>
        <Body />
      </DocumentSheet>,
    );
    expect(windows(container)).toEqual(["0-948", `948-${948 + PAGE_H - 48 - 48}`, "2348-2596"]);
    expect(container.querySelectorAll("[data-doc-sheet]")).toHaveLength(3);
    expect(getByText("Too tall for one page — the rest is cut off")).toBeInTheDocument();
  });

  it("the editor, the PDF and the read-only spread paginate the same way", () => {
    const editor = render(
      <DocumentSheet width={PAGE_W} pageHeight={PAGE_H}>
        <Body />
      </DocumentSheet>,
    );
    const print = render(
      <DocumentSheet variant="print" width={PAGE_W} pageHeight={PAGE_H}>
        <Body />
      </DocumentSheet>,
    );
    expect(windows(print.container)).toEqual(windows(editor.container));
    // Print: one sheet per printed page, flush.
    const sheets = Array.from(print.container.querySelectorAll<HTMLElement>("[data-doc-sheet]"));
    expect(sheets.map((s) => s.style.pageBreakAfter)).toEqual(["always", "always", ""]);
    expect(print.container.querySelector("[data-sheet-gap]")?.getAttribute("data-sheet-gap")).toBe("0");

    const spread = render(<DocumentPagedView state={createBlankDocumentState("article", () => "p1")} mode="paged" zoom={1} />);
    // The spread shows pages 1–2 of the same windows.
    expect(windows(spread.container)).toEqual(windows(editor.container).slice(0, 2));
  });

  it("only the live sheet is focusable; copies are inert, aria-hidden and id-free", () => {
    const { container } = render(
      <DocumentSheet width={PAGE_W} pageHeight={PAGE_H}>
        <Body />
      </DocumentSheet>,
    );
    const check = (liveSheet: number) => {
      const sheets = Array.from(container.querySelectorAll<HTMLElement>("[data-doc-sheet]"));
      sheets.forEach((sheet, i) => {
        const win = sheet.querySelector<HTMLElement>("[data-sheet-window]");
        if (!win) throw new Error(`sheet ${i + 1} has no window`);
        if (i === liveSheet) {
          expect(win.hasAttribute("inert")).toBe(false);
          expect(win.getAttribute("aria-hidden")).toBeNull();
          return;
        }
        expect(win.hasAttribute("inert")).toBe(true);
        expect(win.getAttribute("aria-hidden")).toBe("true");
        // Nothing focusable outside an inert subtree.
        for (const el of Array.from(win.querySelectorAll(FOCUSABLE))) expect(el.closest("[inert]")).not.toBeNull();
      });
      const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.sort()).toEqual(["edit-work", "resume-name"]);
    };
    check(0);
    // The pointer moves to page 3: it goes live, page 1 becomes a copy.
    act(() => {
      fireEvent.pointerEnter(container.querySelector('[data-doc-sheet="3"]') as Element);
    });
    check(2);
  });
});
