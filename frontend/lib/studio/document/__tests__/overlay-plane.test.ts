/** Page units ⇄ the overlay plane (overlay-plane.ts). */
import { describe, expect, it } from "vitest";
import {
  EDITOR_SHEET_GAP,
  fromPlanePosition,
  placeOnPlane,
  planePageAt,
  planePageTop,
  planeSpan,
  toPlanePosition,
} from "../overlay-plane";
import { defaultWidget } from "@/lib/studio/editor-v2/canvas-state";

const pos = { x: 0.25, y: 1.5, width: 0.5, height: 0.25, z: 3, rotation: 10 };

describe("overlay plane positions", () => {
  it("round-trips through the plane for any page count", () => {
    for (const n of [1, 2, 5]) {
      const back = fromPlanePosition(toPlanePosition(pos, n), n);
      expect(back.y).toBeCloseTo(pos.y);
      expect(back.height).toBeCloseTo(pos.height);
    }
  });

  it("only scales the vertical axis", () => {
    const plane = toPlanePosition(pos, 3);
    expect(plane).toMatchObject({ x: 0.25, width: 0.5, z: 3, rotation: 10 });
    expect(plane.y).toBeCloseTo(0.5);
  });

  it("treats a page count under 1 as one page", () => {
    expect(toPlanePosition(pos, 0)).toEqual(pos);
    expect(fromPlanePosition(pos, -2)).toEqual(pos);
  });
});

describe("the editor plane with a gutter between sheets", () => {
  const G = EDITOR_SHEET_GAP;

  it("spans the pages plus the gutters, and finds pages across them", () => {
    expect(planeSpan(3, G)).toBeCloseTo(3 + 2 * G);
    expect(planeSpan(0, G)).toBe(1);
    expect(planePageTop(2, G)).toBeCloseTo(2 + 2 * G);
    expect(planePageAt(planePageTop(2, G) + 0.01, G)).toBe(2);
    // A point in the gutter belongs to the page above it.
    expect(planePageAt(1 + G / 2, G)).toBe(0);
  });

  it("round-trips page units through the plane, on and across page edges", () => {
    const cases = [
      { y: 0, height: 0.25 }, // top of page 1
      { y: 1.5, height: 0.25 }, // middle of page 2
      { y: 0.75, height: 0.25 }, // bottom exactly on the page 1 edge
      { y: 1, height: 0.5 }, // top exactly on the page 2 edge
      { y: 0.9, height: 0.3 }, // straddles the gutter
      { y: 2.6, height: 0.4 }, // last page, to its end
    ];
    for (const c of cases) {
      const p = { ...pos, ...c };
      const back = fromPlanePosition(toPlanePosition(p, 3, G), 3, G);
      expect(back.y).toBeCloseTo(p.y, 9);
      expect(back.height).toBeCloseTo(p.height, 9);
      expect(back).toMatchObject({ x: pos.x, width: pos.width, z: pos.z, rotation: pos.rotation });
    }
  });

  it("puts page 2 below the gutter: its top is (1 + gap) / span down the plane", () => {
    const plane = toPlanePosition({ ...pos, y: 1, height: 0.5 }, 2, G);
    expect(plane.y).toBeCloseTo((1 + G) / (2 + G), 9);
    expect(plane.height).toBeCloseTo(0.5 / (2 + G), 9);
    // An element straddling the gutter is drawn across it.
    const across = toPlanePosition({ ...pos, y: 0.9, height: 0.2 }, 2, G);
    expect(across.height).toBeCloseTo((0.2 + G) / (2 + G), 9);
  });

  it("a point dropped in the gutter snaps to the bottom of the page above", () => {
    const span = planeSpan(2, G);
    const back = fromPlanePosition({ ...pos, y: (1 + G / 2) / span, height: 0 }, 2, G);
    expect(back.y).toBeCloseTo(1, 9);
  });

  it("gap 0 is the flush plane exports draw (the linear mapping)", () => {
    expect(toPlanePosition(pos, 3, 0)).toEqual(toPlanePosition(pos, 3));
    expect(toPlanePosition(pos, 3).y).toBeCloseTo(0.5);
  });

  it("placement centres the element on the drop point across the gutter", () => {
    const widget = defaultWidget("text");
    const at = { x: 0.5, y: (planePageTop(1, G) + 0.5) / planeSpan(2, G) }; // middle of page 2
    const placed = placeOnPlane(widget, at, 1, 2, G);
    expect(placed.position.y + placed.position.height / 2).toBeCloseTo(1.5, 6);
  });
});
