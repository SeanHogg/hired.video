/**
 * Frame edits — how the kit's one video editor turns studio-style edits on the
 * frame into résumé / plan changes, on a canvas derived from a real résumé:
 * scene lengths clamp to the plan's limits, timing is read off the canvas,
 * retyping a résumé-made heading edits the résumé while an added widget keeps
 * its own wording, and PropertiesPanel patches keep position / timing /
 * wording AND look for every widget (overrides for résumé-made ones).
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { readVideoPlan, SCENE_SECONDS_MAX, SCENE_SECONDS_MIN, VideoPlanSchema, type VideoPlan } from "@shared/video-plan";
import { buildVideoOutline } from "@/lib/build/video-outline";
import { outlineToCanvasState } from "@/lib/build/video-canvas";
import type { Translate } from "@/lib/build/video-copy";
import { defaultWidget, type CanvasState, type Widget, type WidgetPosition } from "@/lib/studio/editor-v2/canvas-state";
import { addWidget, applyCanvasOverrides } from "@/lib/build/canvas-overrides";
import {
  addedWidgetScene,
  canvasSceneTimes,
  clampSceneSeconds,
  patchAddedWidget,
  placeWidget,
  planWidgetPatch,
  retypeWidget,
  widgetText,
} from "@/lib/build/frame-edits";

const content: ResumeContent = ResumeContentSchema.parse({
  basics: {
    name: "Dana Okafor",
    label: "Product Designer",
    summary: "Designer who ships. Former ICU nurse.",
    location: { city: "Detroit", region: "MI", countryCode: "US" },
  },
  work: [
    {
      id: "c0ffee00-0000-4000-8000-000000000042",
      name: "Hinge Health",
      position: "Senior Product Designer",
      startDate: "2022-01",
      endDate: "Present",
      highlights: ["Owned the onboarding redesign end to end", "Lifted 30-day activation 22% with a guided first session"],
    },
  ],
  skills: [{ name: "Figma", keywords: ["Prototyping"] }, { name: "User research" }],
});

const t: Translate = (key, opts) => (opts ? `${key}|${JSON.stringify(opts)}` : key);
const derived = (plan: VideoPlan = {}): CanvasState =>
  applyCanvasOverrides(outlineToCanvasState(buildVideoOutline(content), t), plan.canvas);
const widget = (canvas: CanvasState, id: string): Widget => {
  const found = canvas.scenes.flatMap((s) => s.widgets).find((w) => w.id === id);
  if (!found) throw new Error(`no widget ${id}`);
  return found;
};

const MOVED: WidgetPosition = { x: 0.1, y: 0.2, width: 0.5, height: 0.15, z: 7, rotation: 12 };
const ADDED: Widget = { ...defaultWidget("text"), id: "w_added_1" };

describe("clampSceneSeconds", () => {
  it("rounds a drag to whole seconds inside the plan's limits", () => {
    expect(clampSceneSeconds(6.4)).toBe(6);
    expect(clampSceneSeconds(0.5)).toBe(SCENE_SECONDS_MIN);
    expect(clampSceneSeconds(99)).toBe(SCENE_SECONDS_MAX);
    expect(clampSceneSeconds(Number.NaN)).toBe(SCENE_SECONDS_MIN);
  });
});

describe("canvasSceneTimes", () => {
  it("reads starts and lengths off the canvas (narration may lengthen a scene)", () => {
    const canvas = derived();
    const longer = { ...canvas, scenes: canvas.scenes.map((s, i) => (i === 0 ? { ...s, durationSeconds: 11.4 } : s)) };
    const times = canvasSceneTimes(longer);
    expect(times[0]?.duration).toBe(11.4);
    expect(times[1]?.start).toBe(11.4);
    expect(times.map((s) => s.id)).toEqual(buildVideoOutline(content).scenes.map((s) => s.id));
  });
});

describe("placeWidget", () => {
  it("centres a dropped widget on the drop point, inside the frame, on top", () => {
    const placed = placeWidget(ADDED, { x: 0.99, y: 0.5 }, 9);
    expect(placed.position.x).toBeCloseTo(1 - ADDED.position.width);
    expect(placed.position.y).toBeCloseTo(0.5 - ADDED.position.height / 2);
    expect(placed.position.z).toBe(9);
  });

  it("keeps the default spot for a palette click", () => {
    expect(placeWidget(ADDED, undefined, 2).position).toEqual({ ...ADDED.position, z: 2 });
  });
});

describe("retypeWidget", () => {
  it("writes a résumé-made heading back to the résumé", () => {
    const result = retypeWidget(content, {}, "build-proof-heading", "Hinge Health Labs", t);
    expect(result.target).toBe("content");
    if (result.target !== "content") return;
    expect(widgetText(widget(derived(readVideoPlan(result.content)), "build-proof-heading"))).toBeDefined();
    expect(JSON.stringify(result.content)).toContain("Hinge Health Labs");
  });

  it("keeps an added widget's wording as its own override", () => {
    const plan = addWidget({}, "proof", ADDED);
    const result = retypeWidget(content, plan, ADDED.id, "Hello there", t);
    expect(result.target).toBe("plan");
    if (result.target !== "plan") return;
    expect(widgetText(widget(derived(result.plan), ADDED.id))).toBe("Hello there");
    expect(VideoPlanSchema.safeParse(result.plan).success).toBe(true);
  });
});

describe("added widgets", () => {
  it("finds the scene an added widget lives in; résumé-made ones have none", () => {
    const plan = addWidget({}, "skills", ADDED);
    expect(addedWidgetScene(plan, ADDED.id)).toBe("skills");
    expect(addedWidgetScene(plan, "build-proof-heading")).toBeNull();
  });

  it("patches an added widget as stored, and leaves other ids alone", () => {
    const plan = addWidget({}, "skills", ADDED);
    const next = patchAddedWidget(plan, ADDED.id, { containerStyle: { backgroundColor: "#112233" } });
    expect(widget(derived(next), ADDED.id).containerStyle).toEqual({ backgroundColor: "#112233" });
    expect(patchAddedWidget(plan, "build-proof-heading", { containerStyle: {} })).toBe(plan);
  });
});

describe("planWidgetPatch", () => {
  const canvas = derived();
  const heading = widget(canvas, "build-proof-heading");

  it("keeps position and timing for a résumé-made widget", () => {
    const moved = planWidgetPatch({}, heading, { position: MOVED });
    expect(widget(derived(moved.plan), heading.id).position).toEqual(MOVED);

    const timed = planWidgetPatch({}, heading, { visibleFrom: 1 });
    const out = widget(derived(timed.plan), heading.id);
    expect([out.visibleFrom, out.visibleTo]).toEqual([1, heading.visibleTo]);
  });

  it("routes a wording change to retype, and keeps a résumé-made widget's look as an override", () => {
    if (heading.params.kind !== "heading" && heading.params.kind !== "text") throw new Error("heading is text");
    const retyped = planWidgetPatch({}, heading, {
      params: { ...heading.params, data: { ...heading.params.data, text: "New words" } },
    });
    expect(retyped).toEqual({ plan: {}, retype: "New words" });

    const restyled = planWidgetPatch({}, heading, {
      params: { ...heading.params, data: { ...heading.params.data, color: "#ff0000" } },
    });
    expect(restyled.retype).toBeNull();
    expect(restyled.plan.canvas?.widgets?.[heading.id]).toEqual({ params: { color: "#ff0000" } });
    const out = widget(derived(restyled.plan), heading.id);
    expect((out.params.kind === "heading" || out.params.kind === "text") && out.params.data.color).toBe("#ff0000");
    // Wording still flows from the page.
    expect(widgetText(out)).toBe(widgetText(heading));
  });

  it("never drops a style edit on a résumé-made widget (motion, container, effects)", () => {
    const motion = {
      enter: { kind: "fade" as const, durationSeconds: 0.4, easing: "ease-out" as const },
      exit: { kind: "none" as const, durationSeconds: 0.5, easing: "ease-in" as const },
    };
    const styled = planWidgetPatch({}, heading, {
      motion,
      containerStyle: { backgroundColor: "#101010", borderRadius: 12 },
      effects: [{ kind: "drop-shadow", params: { blur: 8 } }],
    });
    expect(styled).not.toHaveProperty("unsupported");
    const out = widget(derived(styled.plan), heading.id);
    expect(out.motion).toEqual(motion);
    expect(out.containerStyle).toEqual({ backgroundColor: "#101010", borderRadius: 12 });
    expect(out.effects).toEqual([{ kind: "drop-shadow", params: { blur: 8 } }]);

    const still = planWidgetPatch(styled.plan, out, { motion: null });
    expect(widget(derived(still.plan), heading.id).motion).toBeNull();
    // The stored plan reads back.
    expect(readVideoPlan({ meta: { video: JSON.parse(JSON.stringify(still.plan)) } })).toEqual(
      JSON.parse(JSON.stringify(still.plan)),
    );
  });

  it("keeps the look of an added widget", () => {
    const plan = addWidget({}, "proof", ADDED);
    const current = widget(derived(plan), ADDED.id);
    if (current.params.kind !== "text") throw new Error("added is text");
    const result = planWidgetPatch(plan, current, {
      params: { ...current.params, data: { ...current.params.data, color: "#00ff00" } },
    });
    const out = widget(derived(result.plan), ADDED.id);
    expect(out.params.kind === "text" && out.params.data.color).toBe("#00ff00");
  });
});
