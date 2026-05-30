/**
 * Pure mutator tests for the CAD 3D state runtime (#930 Phase 2).
 * Confirms the contract every consumer (palette + inspector + AI agent)
 * depends on:
 *   - Adds are immutable + push a single new entity
 *   - Boolean ops require ≥2 children + don't auto-delete the children
 *   - deleteEntities prunes selection in lockstep
 *   - updateEntity preserves order
 *   - All mutators select the new/edited entity (sane default for
 *     UI follow-up)
 */
import { describe, it, expect } from "vitest";
import { createBlankCad3DState } from "@shared/cad-3d-state";
import {
  addBox,
  addCylinder,
  addSphere,
  addExtrusion,
  addBooleanOp,
  deleteEntities,
  updateEntity,
  setEntityTranslate,
} from "../cad-3d-edit";

describe("cad-3d-edit mutators", () => {
  it("addBox inserts a box at the build-volume centre + selects it", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    expect(s1.entities).toHaveLength(1);
    expect(s1.entities[0].kind).toBe("box");
    expect(s1.selectedIds).toHaveLength(1);
    expect(s1.selectedIds[0]).toBe(s1.entities[0].id);
    // Translate landed at build-volume centre (default 220/220/250).
    expect(s1.entities[0].translate).toEqual({ x: 110, y: 110, z: 125 });
    // s0 is untouched (immutable).
    expect(s0.entities).toHaveLength(0);
  });

  it("addCylinder + addSphere + addExtrusion all yield the right kind", () => {
    const s0 = createBlankCad3DState();
    const s1 = addCylinder(s0);
    const s2 = addSphere(s1);
    const s3 = addExtrusion(s2, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }], 4);
    expect(s3.entities.map((e) => e.kind)).toEqual(["cylinder", "sphere", "extrude"]);
  });

  it("addBooleanOp groups ≥2 children + does NOT delete them", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    const s2 = addCylinder(s1);
    const a = s2.entities[0].id;
    const b = s2.entities[1].id;
    const s3 = addBooleanOp(s2, "difference", [a, b]);
    expect(s3.entities).toHaveLength(3);
    const op = s3.entities[2];
    expect(op.kind).toBe("boolean");
    if (op.kind === "boolean") {
      expect(op.op).toBe("difference");
      expect(op.children).toEqual([a, b]);
    }
    // Children persist alongside the op.
    expect(s3.entities.find((e) => e.id === a)).toBeDefined();
    expect(s3.entities.find((e) => e.id === b)).toBeDefined();
  });

  it("addBooleanOp throws on <2 children", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    expect(() => addBooleanOp(s1, "union", [s1.entities[0].id])).toThrow(/at least 2/);
  });

  it("deleteEntities prunes selectedIds in lockstep", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    const s2 = addSphere(s1);
    // Both ids are selected after addSphere selected the new one.
    expect(s2.selectedIds).toEqual([s2.entities[1].id]);
    // Add the box id to selection explicitly.
    const augmented = { ...s2, selectedIds: [s2.entities[0].id, s2.entities[1].id] };
    const s3 = deleteEntities(augmented, [s2.entities[0].id]);
    expect(s3.entities.map((e) => e.id)).toEqual([s2.entities[1].id]);
    expect(s3.selectedIds).toEqual([s2.entities[1].id]);
  });

  it("updateEntity patches fields without touching position or other entities", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    const s2 = addCylinder(s1);
    const boxId = s2.entities[0].id;
    const s3 = updateEntity(s2, boxId, { widthMm: 50 });
    const box = s3.entities[0];
    if (box.kind === "box") {
      expect(box.widthMm).toBe(50);
      // Other dims untouched.
      expect(box.heightMm).toBe(20);
      expect(box.depthMm).toBe(20);
    }
    // Cylinder untouched.
    expect(s3.entities[1]).toBe(s2.entities[1]);
  });

  it("setEntityTranslate updates the translate field only", () => {
    const s0 = createBlankCad3DState();
    const s1 = addBox(s0);
    const boxId = s1.entities[0].id;
    const s2 = setEntityTranslate(s1, boxId, { x: 50, y: 0, z: 0 });
    expect(s2.entities[0].translate).toEqual({ x: 50, y: 0, z: 0 });
  });
});
