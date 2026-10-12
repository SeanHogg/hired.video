/**
 * BuilderState model + pure mutation tests (#1955 T0.1).
 *
 * Run: vitest run lib/studio/builder/__tests__/builder-edit.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  createBuilderState,
  rootNodeType,
  builderNodeType,
  childTypeOf,
  BUILDER_ENTITY_KINDS,
} from "../builder-state";
import {
  addNode,
  removeNode,
  updateNodeFields,
  moveNode,
  findNode,
} from "../builder-edit";

function counter() {
  let n = 0;
  return () => `id${++n}`;
}

describe("createBuilderState", () => {
  it("mints an empty, entity-bound builder", () => {
    const s = createBuilderState("course", counter());
    expect(s.entityKind).toBe("course");
    expect(s.entityId).toBeNull();
    expect(s.nodes).toEqual([]);
    expect(s.schemaVersion).toBeGreaterThan(0);
  });

  it("binds entityId when editing an existing row", () => {
    const s = createBuilderState("pitch_deck", counter(), "deck-1");
    expect(s.entityId).toBe("deck-1");
  });
});

describe("entity node-type defs", () => {
  it("course nests module → lesson", () => {
    expect(rootNodeType("course").type).toBe("module");
    expect(childTypeOf("course", "module")).toBe("lesson");
    expect(childTypeOf("course", "lesson")).toBeUndefined();
    expect(builderNodeType("course", "lesson")?.label).toBe("Lesson");
  });

  it("flat builders have a single root level with no child", () => {
    expect(rootNodeType("screening_template").type).toBe("question");
    expect(childTypeOf("screening_template", "question")).toBeUndefined();
  });

  it("every entity kind resolves a root node type", () => {
    for (const k of BUILDER_ENTITY_KINDS) {
      expect(rootNodeType(k).type).toBeTruthy();
    }
  });
});

describe("addNode", () => {
  it("appends a top-level node", () => {
    const s0 = createBuilderState("course", counter());
    const { state, nodeId } = addNode(s0, null, "module");
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].id).toBe(nodeId);
    expect(state.nodes[0].type).toBe("module");
    // immutability
    expect(s0.nodes).toHaveLength(0);
  });

  it("nests a child under a parent", () => {
    let s = createBuilderState("course", counter());
    const mod = addNode(s, null, "module");
    s = mod.state;
    const lesson = addNode(s, mod.nodeId, "lesson");
    s = lesson.state;
    expect(s.nodes[0].children).toHaveLength(1);
    expect(s.nodes[0].children[0].type).toBe("lesson");
    expect(findNode(s, lesson.nodeId)?.id).toBe(lesson.nodeId);
  });
});

describe("removeNode", () => {
  it("prunes a node and its subtree at any depth", () => {
    let s = createBuilderState("course", counter());
    const mod = addNode(s, null, "module");
    s = mod.state;
    const lesson = addNode(s, mod.nodeId, "lesson");
    s = lesson.state;
    s = removeNode(s, lesson.nodeId);
    expect(s.nodes[0].children).toHaveLength(0);
    s = removeNode(s, mod.nodeId);
    expect(s.nodes).toHaveLength(0);
  });
});

describe("updateNodeFields", () => {
  it("shallow-merges a node's fields", () => {
    let s = createBuilderState("screening_template", counter());
    const q = addNode(s, null, "question");
    s = q.state;
    s = updateNodeFields(s, q.nodeId, { prompt: "Why us?" });
    s = updateNodeFields(s, q.nodeId, { required: true });
    expect(findNode(s, q.nodeId)?.fields).toEqual({ prompt: "Why us?", required: true });
  });
});

describe("moveNode", () => {
  it("reorders within the sibling list and clamps at the ends", () => {
    let s = createBuilderState("pitch_deck", counter());
    const a = addNode(s, null, "slide");
    s = a.state;
    const b = addNode(s, null, "slide");
    s = b.state;
    s = moveNode(s, b.nodeId, "up");
    expect(s.nodes.map((n) => n.id)).toEqual([b.nodeId, a.nodeId]);
    // moving the top one up is a no-op
    s = moveNode(s, b.nodeId, "up");
    expect(s.nodes.map((n) => n.id)).toEqual([b.nodeId, a.nodeId]);
  });

  it("reorders nested children", () => {
    let s = createBuilderState("course", counter());
    const mod = addNode(s, null, "module");
    s = mod.state;
    const l1 = addNode(s, mod.nodeId, "lesson");
    s = l1.state;
    const l2 = addNode(s, mod.nodeId, "lesson");
    s = l2.state;
    s = moveNode(s, l2.nodeId, "up");
    expect(s.nodes[0].children.map((n) => n.id)).toEqual([l2.nodeId, l1.nodeId]);
  });
});
