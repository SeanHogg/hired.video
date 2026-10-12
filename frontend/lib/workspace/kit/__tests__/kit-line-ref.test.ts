/** A click on the résumé page → the selected line (kit-line-ref.ts) and the
 *  selection store (use-kit-line-selection.ts). */
import { describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";
import { lineRefOfPath } from "@/lib/build/this-line";
import { LINE_PATH_ATTR, lineRefOfClick, lineTargetOf } from "../kit-line-ref";
import { createKitLineSelectionStore, sameKitLine } from "../use-kit-line-selection";

// Shaped like a parsed résumé: entries carry ids, one bullet is blank.
const CONTENT = {
  basics: { name: "Sean Hogg", label: "CIO", summary: "Technology leader." },
  work: [
    {
      id: "w-macomb",
      name: "Macomb Community College",
      position: "CIO",
      summary: "Led IT for 40,000 students.",
      highlights: ["Cut infrastructure cost 20%", "", "Shipped the ERP on time"],
    },
  ],
} as unknown as ResumeContent;

function page(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <section>
      <ul>
        <li><span ${LINE_PATH_ATTR}="work.0.highlights.2">Shipped the <b>ERP</b> on time</span>
          <button type="button" class="flag">!</button></li>
      </ul>
      <p ${LINE_PATH_ATTR}="basics.summary">Technology leader.</p>
      <button type="button" class="pencil"><span ${LINE_PATH_ATTR}="basics.label">CIO</span></button>
      <p class="blank">nothing here</p>
    </section>`;
  document.body.appendChild(root);
  return root;
}

describe("lineTargetOf", () => {
  it("finds the line from a click inside it", () => {
    const root = page();
    expect(lineTargetOf(root.querySelector("b"), root)).toBe("work.0.highlights.2");
  });

  it("ignores controls, even ones wrapping a line, and bare paper", () => {
    const root = page();
    expect(lineTargetOf(root.querySelector(".flag"), root)).toBeNull();
    expect(lineTargetOf(root.querySelector(".pencil span"), root)).toBeNull();
    expect(lineTargetOf(root.querySelector(".blank"), root)).toBeNull();
    expect(lineTargetOf(null, root)).toBeNull();
  });
});

describe("lineRefOfClick", () => {
  it("builds the same ref the inspector resolves, plus the path", () => {
    const root = page();
    const ref = lineRefOfClick(CONTENT, root.querySelector("b"), root);
    expect(ref).toEqual({ ...lineRefOfPath(CONTENT, "work.0.highlights.2"), path: "work.0.highlights.2" });
    expect(ref).toMatchObject({ section: "work", itemId: "w-macomb", text: "Shipped the ERP on time" });
  });

  it("is null for a path that is no selectable line", () => {
    const root = document.createElement("div");
    root.innerHTML = `<span ${LINE_PATH_ATTR}="work.0.highlights.1">x</span>`;
    expect(lineRefOfClick(CONTENT, root.firstElementChild, root)).toBeNull();
  });
});

describe("line selection store", () => {
  const line = { section: "work", itemId: "w-macomb", lineIndex: 2, text: "Shipped the ERP on time" };

  it("notifies on a change, not on re-selecting the same line", () => {
    const store = createKitLineSelectionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set(line);
    store.set({ ...line });
    expect(listener).toHaveBeenCalledTimes(1);
    store.set(null);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.set(line);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("compares lines by place, not text", () => {
    expect(sameKitLine(line, { ...line, text: "edited" })).toBe(true);
    expect(sameKitLine(line, { ...line, lineIndex: 1 })).toBe(false);
    expect(sameKitLine(line, null)).toBe(false);
    expect(sameKitLine(null, null)).toBe(true);
  });
});
