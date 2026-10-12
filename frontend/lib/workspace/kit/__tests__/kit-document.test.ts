/** Free elements on a kit's résumé / letter pages (kit-document.ts). */
import { describe, expect, it } from "vitest";
import { defaultWidget, type Widget } from "@/lib/studio/editor-v2/canvas-state";
import {
  KIT_PAGE_IDS,
  addKitOverlay,
  emptyKitDocument,
  findKitOverlay,
  isKitDocPage,
  kitPageCanvas,
  kitPageOverlays,
  kitPagePaper,
  kitPageScene,
  moveKitOverlay,
  normalizeKitDocument,
  patchKitOverlay,
  planePageCount,
  removeKitOverlay,
  reorderKitOverlays,
  toggleKitOverlayFlag,
} from "../kit-document";
import { EDITOR_SHEET_GAP as GAP } from "@/lib/studio/document/overlay-plane";

/** The value, or the test fails here (no non-null assertions). */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const widget =(id: string, y = 0.1, height = 0.15): Widget => ({
  ...defaultWidget("text"),
  id,
  position: { x: 0.1, y, width: 0.4, height, z: 1, rotation: 0 },
});

/** What a kit project's `document_state` holds after a save (JSON round-trip). */
function stored(overlays: unknown[], page = KIT_PAGE_IDS.resume) {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      pageSize: "letter",
      orientation: "portrait",
      columns: 12,
      theme: { themeKey: "hired-purple", fontFamily: "sans", headingStyle: "underlined", density: "comfortable" },
      pages: [{ id: page, blocks: [{ id: "b1", kind: "section", sectionKey: "work", mode: "flow" }], overlays }],
      entityKind: "resume",
      entityId: "r1",
    }),
  );
}

describe("normalizeKitDocument", () => {
  it("starts empty with both kit pages for nothing / junk", () => {
    for (const raw of [null, undefined, "x", 42, { pages: "nope" }]) {
      const doc = normalizeKitDocument(raw, "r1");
      expect(doc.pages.map((p) => p.id)).toEqual([KIT_PAGE_IDS.resume, KIT_PAGE_IDS.letter]);
      expect(doc.pages.every((p) => p.blocks.length === 0 && p.overlays.length === 0)).toBe(true);
      expect(doc.entityId).toBe("r1");
    }
  });

  it("keeps stored elements and their layer flags, drops flow blocks", () => {
    const doc = normalizeKitDocument(stored([{ widget: widget("w1"), hidden: true }, { widget: widget("w2"), locked: true }]), "r1");
    const overlays = kitPageOverlays(doc, "resume");
    expect(overlays.map((o) => o.widget.id)).toEqual(["w1", "w2"]);
    expect(overlays[0].hidden).toBe(true);
    expect(overlays[1].locked).toBe(true);
    expect(doc.pages[0].blocks).toEqual([]);
    expect(kitPageOverlays(doc, "letter")).toEqual([]);
  });

  it("drops malformed elements and fills a missing z / rotation", () => {
    const noZ = { ...widget("w3"), position: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } };
    const doc = normalizeKitDocument(
      stored([{ widget: { id: "bad" } }, null, { widget: { ...widget("w4"), position: { x: "1" } } }, { widget: noZ }]),
      null,
    );
    const overlays = kitPageOverlays(doc, "resume");
    expect(overlays.map((o) => o.widget.id)).toEqual(["w3"]);
    expect(overlays[0].widget.position.z).toBe(0);
    expect(overlays[0].widget.position.rotation).toBe(0);
  });

  it("ignores pages that aren't the kit's", () => {
    const doc = normalizeKitDocument(stored([{ widget: widget("w1") }], "some-other-page"), "r1");
    expect(kitPageOverlays(doc, "resume")).toEqual([]);
  });
});

describe("element edits", () => {
  const base = emptyKitDocument("r1");

  it("adds on top of the page's stack, on that page only", () => {
    let doc = addKitOverlay(base, "letter", widget("a"));
    doc = addKitOverlay(doc, "letter", widget("b"));
    const [a, b] = kitPageOverlays(doc, "letter");
    expect(b.widget.position.z).toBeGreaterThan(a.widget.position.z);
    expect(kitPageOverlays(doc, "resume")).toEqual([]);
  });

  it("moves, but never a locked element", () => {
    let doc = addKitOverlay(base, "resume", widget("a"));
    const to = { x: 0.5, y: 1.4, width: 0.2, height: 0.1, z: 1, rotation: 15 };
    doc = moveKitOverlay(doc, "resume", "a", to);
    expect(findKitOverlay(doc, "resume", "a")?.widget.position).toEqual(to);
    doc = toggleKitOverlayFlag(doc, "resume", "a", "locked");
    const locked = moveKitOverlay(doc, "resume", "a", { ...to, x: 0 });
    expect(locked).toBe(doc);
  });

  it("patches properties without changing the id; unknown ids change nothing", () => {
    const doc = addKitOverlay(base, "resume", widget("a"));
    const next = patchKitOverlay(doc, "resume", "a", { id: "hijack", motion: null, visibleFrom: null });
    expect(findKitOverlay(next, "resume", "a")).not.toBeNull();
    expect(patchKitOverlay(doc, "resume", "missing", { motion: null })).toBe(doc);
  });

  it("restacks front-to-back and toggles flags on and off", () => {
    let doc = addKitOverlay(addKitOverlay(addKitOverlay(base, "resume", widget("a")), "resume", widget("b")), "resume", widget("c"));
    doc = reorderKitOverlays(doc, "resume", ["a", "c", "b"]);
    const z = (id: string) => must(findKitOverlay(doc, "resume", id)).widget.position.z;
    expect(z("a")).toBeGreaterThan(z("c"));
    expect(z("c")).toBeGreaterThan(z("b"));
    doc = toggleKitOverlayFlag(doc, "resume", "b", "hidden");
    expect(findKitOverlay(doc, "resume", "b")?.hidden).toBe(true);
    doc = toggleKitOverlayFlag(doc, "resume", "b", "hidden");
    expect(findKitOverlay(doc, "resume", "b")?.hidden).toBeUndefined();
  });

  it("removes", () => {
    const doc = removeKitOverlay(addKitOverlay(base, "resume", widget("a")), "resume", "a");
    expect(kitPageOverlays(doc, "resume")).toEqual([]);
  });
});

describe("the stage plane", () => {
  it("spans the document's pages, or further when an element sits below its end", () => {
    const doc = addKitOverlay(emptyKitDocument(null), "resume", widget("low", 2.5, 0.2));
    expect(planePageCount(doc, "resume", 1)).toBe(3);
    expect(planePageCount(doc, "resume", 4)).toBe(4);
    expect(planePageCount(emptyKitDocument(null), "letter", 0)).toBe(1);
  });

  it("scenes the page's elements in plane units, hidden ones only on request", () => {
    let doc = addKitOverlay(emptyKitDocument(null), "resume", widget("a", 1.2, 0.2));
    doc = addKitOverlay(doc, "resume", widget("b"));
    doc = toggleKitOverlayFlag(doc, "resume", "b", "hidden");
    const scene = kitPageScene(doc, "resume", { pageCount: 2, label: "Résumé" });
    expect(scene.id).toBe(KIT_PAGE_IDS.resume);
    expect(scene.backgroundColor).toBe("transparent");
    expect(scene.widgets.map((w) => w.id)).toEqual(["a"]);
    // The editor plane: 2 pages + one gutter; page 2 starts 1 + GAP down.
    const span = 2 + GAP;
    expect(scene.widgets[0].position.y).toBeCloseTo((1 + GAP + 0.2) / span, 6);
    expect(scene.widgets[0].position.height).toBeCloseTo(0.2 / span, 6);
    expect(kitPageScene(doc, "resume", { pageCount: 2, label: "", includeHidden: true }).widgets).toHaveLength(2);
  });

  it("gives the inspector a canvas the plane's size", () => {
    const doc = addKitOverlay(emptyKitDocument(null), "letter", widget("a"));
    const canvas = kitPageCanvas(doc, "letter", { width: 794, pageHeight: 1123, pageCount: 2, label: "Letter" });
    expect(canvas.width).toBe(794);
    expect(canvas.height).toBe(Math.round(1123 * (2 + GAP)));
    expect(canvas.scenes[0].widgets[0].id).toBe("a");
  });
});

describe("helpers", () => {
  it("knows the kit's document pages and their paper", () => {
    expect(isKitDocPage("resume")).toBe(true);
    expect(isKitDocPage("video")).toBe(false);
    expect(kitPagePaper("a4")).toBe("a4");
    expect(kitPagePaper(undefined)).toBe("letter");
  });
});

describe("kitPrintWidgets", () => {
  it("prints every element except hidden ones", async () => {
    const { kitPrintWidgets } = await import("../kit-print-overlays");
    let doc = addKitOverlay(addKitOverlay(emptyKitDocument(null), "resume", widget("a")), "resume", widget("b"));
    doc = toggleKitOverlayFlag(doc, "resume", "a", "hidden");
    expect(kitPrintWidgets(doc, "resume").map((w) => w.id)).toEqual(["b"]);
    expect(kitPrintWidgets(doc, "letter")).toEqual([]);
  });
});
