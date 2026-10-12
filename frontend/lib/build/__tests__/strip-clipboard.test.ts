/**
 * Strip clipboard on the plan: copying a scene (settings + added elements
 * as they play), pasting it over another scene (replace, switch on, fresh
 * ids, Proof-only roles), and cutting (switch off, never the last scene).
 */
import { describe, it, expect } from "vitest";
import { VideoPlanSchema, type VideoPlan } from "@shared/video-plan";
import type { CanvasState, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { copySceneClip, cutScene, pasteSceneClip } from "@/lib/build/strip-clipboard";

const sticker = (id: string, x = 0.1): Widget =>
  ({
    id,
    kind: "text",
    position: { x, y: 0.1, width: 0.2, height: 0.1, z: 3, rotation: 0 },
    params: { kind: "text", data: { text: "Open to work", fontPx: 32, color: "#fff", fontWeight: "normal", align: "left", background: null } },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  }) as Widget;

/** A canvas widget as the plan stores it (the plan schema keeps it loose). */
const asStored = (w: Widget) => w as unknown as { id: string; kind: string; [key: string]: unknown };

const plan: VideoPlan = {
  scenes: {
    hook: { look: "ember", duration: 5, voiceover: "I cut costs by $1.79M.", title: "I hand back the savings." },
    proof: { roles: ["work-0", "work-1"], look: "ocean" },
    who: { look: "forest", lines: ["Old line"] },
  },
  canvas: { added: { hook: [asStored(sticker("w-1"))] } },
};

let n = 0;
const freshId = (w: Widget): Widget => ({ ...w, id: `copy-${++n}` });

describe("copySceneClip", () => {
  it("takes the scene's settings (not off) and its added elements", () => {
    const clip = copySceneClip({ ...plan, scenes: { ...plan.scenes, hook: { ...plan.scenes!.hook, off: true } } }, "hook");
    expect(clip.scene).toEqual(plan.scenes!.hook);
    expect(clip.added.map((w) => w.id)).toEqual(["w-1"]);
  });

  it("takes added elements as they play on the canvas (moves applied)", () => {
    const canvas = { scenes: [{ id: "build-hook", widgets: [sticker("w-1", 0.6)] }] } as unknown as CanvasState;
    expect(copySceneClip(plan, "hook", canvas).added[0].position.x).toBe(0.6);
  });

  it("is a snapshot", () => {
    const source: VideoPlan = structuredClone(plan);
    const clip = copySceneClip(source, "hook");
    source.scenes!.hook!.voiceover = "changed";
    expect(clip.scene.voiceover).toBe("I cut costs by $1.79M.");
  });
});

describe("pasteSceneClip", () => {
  it("replaces the target's settings, switches it on and adds element copies", () => {
    const target: VideoPlan = { ...plan, scenes: { ...plan.scenes, who: { look: "forest", lines: ["Old line"], off: true } } };
    const next = pasteSceneClip(target, "who", copySceneClip(plan, "hook"), freshId);
    expect(next.scenes?.who).toEqual(plan.scenes!.hook);
    const added = next.canvas?.added?.who ?? [];
    expect(added).toHaveLength(1);
    expect(added[0].id).not.toBe("w-1");
    // The source is untouched.
    expect(next.scenes?.hook).toEqual(plan.scenes!.hook);
    expect(VideoPlanSchema.safeParse(next).success).toBe(true);
  });

  it("only carries Proof's roles onto Proof", () => {
    const clip = copySceneClip(plan, "proof");
    expect(pasteSceneClip(plan, "skills", clip, freshId).scenes?.skills).toEqual({ look: "ocean" });
    const onProof = pasteSceneClip({ ...plan, scenes: { hook: plan.scenes!.hook } }, "proof", clip, freshId);
    expect(onProof.scenes?.proof?.roles).toEqual(["work-0", "work-1"]);
  });

  it("pasting an empty scene resets the target", () => {
    const next = pasteSceneClip(plan, "who", copySceneClip(plan, "skills"), freshId);
    expect(next.scenes?.who).toBeUndefined();
  });
});

describe("cutScene", () => {
  it("switches the scene off", () => {
    expect(cutScene(plan, "who")?.scenes?.who?.off).toBe(true);
  });

  it("refuses the last scene that is on", () => {
    const one: VideoPlan = { scenes: { who: { off: true }, proof: { off: true }, skills: { off: true }, next: { off: true } } };
    expect(cutScene(one, "hook")).toBeNull();
  });
});
