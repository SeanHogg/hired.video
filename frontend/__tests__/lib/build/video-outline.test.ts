/**
 * Unit tests for the resume (+ video plan) → 5-scene video outline and its VideoScript
 * conversion (the payload "Post my video" hands to the studio).
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import {
  buildVideoOutline,
  formatClock,
  HOOK_MAX,
  outlineDuration,
  sceneStarts,
  toHeadline,
  VIDEO_SCENE_IDS,
} from "@/lib/build/video-outline";
import { sceneCopy, type Translate } from "@/lib/build/video-copy";
import { outlineToVideoScript } from "@/lib/build/video-composition";
import { scriptToCanvasState } from "@/lib/studio/editor-v2/script-to-canvas";
import { patchScenePlan, withVideoPlan, workItemKey, type VideoPlan } from "@shared/video-plan";

const content: ResumeContent = ResumeContentSchema.parse({
  basics: {
    name: "Dana Okafor",
    label: "Product Designer",
    summary: "Designer who ships. Former ICU nurse.",
    location: { city: "Detroit", region: "MI", countryCode: "US" },
  },
  work: [
    { name: "Beaumont Hospital", position: "Registered Nurse", startDate: "2014", endDate: "2021-12", highlights: ["Precepted new grads"] },
    {
      id: "c0ffee00-0000-4000-8000-000000000042",
      name: "Hinge Health",
      position: "Senior Product Designer",
      startDate: "2022-01",
      endDate: "Present",
      highlights: [
        "Owned the onboarding redesign end to end",
        "Lifted 30-day activation 22% with a guided first session",
        "Built the design system used by 6 squads",
      ],
    },
  ],
  skills: [
    { name: "Figma", keywords: ["Prototyping"] },
    { name: "User research" },
    { name: "Design systems", keywords: ["Tokens", "Accessibility", "Figma"] },
  ],
});

// Deterministic fake t: "key|{json}" so assertions can see interpolation.
const t: Translate = (key, opts) => (opts ? `${key}|${JSON.stringify(opts)}` : key);

describe("buildVideoOutline", () => {
  const outline = buildVideoOutline(content);

  it("produces the five scenes in order, 28s total (Proof absorbed the old Résumé scene)", () => {
    expect(outline.scenes.map((s) => s.id)).toEqual([...VIDEO_SCENE_IDS]);
    expect(outline.scenes.map((s) => s.id)).not.toContain("resume");
    expect(outlineDuration(outline)).toBe(28);
  });

  it("lists the Proof roles (newest first, years only) for the résumé page", () => {
    expect(outline.history[0]).toEqual({ position: "Senior Product Designer", company: "Hinge Health", startYear: "2022", endYear: "" });
    expect(outline.history[1]).toMatchObject({ startYear: "2014", endYear: "2021" });
  });

  it("uses the latest role (by start date) for proof and the headline", () => {
    expect(outline.role).toBe("Senior Product Designer");
    expect(outline.company).toBe("Hinge Health");
    const proof = outline.scenes.find((s) => s.id === "proof");
    expect(proof?.lines[0]).toBe("Hinge Health");
  });

  it("hooks on the strongest quantified bullet", () => {
    expect(outline.scenes[0].title).toBe("Lifted 30-day activation 22% with a guided first session");
  });

  it("caps skills at six, de-duplicated", () => {
    const skills = outline.scenes.find((s) => s.id === "skills")?.lines ?? [];
    expect(skills.length).toBeLessThanOrEqual(6);
    expect(new Set(skills).size).toBe(skills.length);
    expect(skills[0]).toBe("Figma");
  });

  it("degrades on an empty resume without throwing", () => {
    const empty = buildVideoOutline(ResumeContentSchema.parse({}));
    expect(empty.scenes).toHaveLength(5);
    expect(empty.name).toBe("");
    expect(empty.photo).toBe("");
    expect(empty.history).toEqual([]);
  });
});

describe("outlineToVideoScript", () => {
  const outline = buildVideoOutline(content);
  const script = outlineToVideoScript(outline, t);

  it("lays scenes back to back with matching total duration", () => {
    expect(script.scenes).toHaveLength(5);
    let cursor = 0;
    for (const s of script.scenes) {
      expect(s.start).toBe(cursor);
      cursor += s.duration;
    }
    expect(script.video.duration).toBe(cursor);
    expect(script.video.aspect).toBe("16:9");
  });

  it("maps scenes to resume storyboard types and carries skills as pills", () => {
    expect(script.scenes.map((s) => s.type)).toEqual(["achievement", "intro", "achievement", "skills", "closing"]);
    const pills = (script.scenes[3].sceneElements ?? []).filter((el) => el.id.startsWith("build-skills-skill-"));
    expect(pills.map((el) => (el.kind === "text" ? el.text : ""))).toEqual(outline.scenes[3].lines);
  });

  it("animates: every visible element enters with motion, and lines stagger", () => {
    for (const s of script.scenes) {
      for (const el of s.sceneElements ?? []) {
        expect(el.motion?.enter.kind, el.id).not.toBe("none");
      }
    }
    const proof = script.scenes[2].sceneElements ?? [];
    const at = (id: string) => proof.find((el) => el.id === id)?.appearAt ?? 0;
    expect(at("build-proof-body-0")).toBeLessThan(at("build-proof-body-1"));
  });

  it("gives every scene its own gradient", () => {
    const grounds = script.scenes.map((s) => s.backgroundEffect);
    expect(grounds.every((g) => g?.startsWith("gradient:"))).toBe(true);
    expect(new Set(grounds).size).toBe(grounds.length);
  });

  it("centres one-line initials in the avatar circle (no padding that wraps them)", () => {
    const els = script.scenes[1].sceneElements ?? [];
    const circle = els.find((el) => el.id === "build-who-avatar");
    const initials = els.find((el) => el.id === "build-who-initials");
    expect(initials && initials.kind === "text" ? initials.text : null).toBe("DO");
    expect(initials?.style?.padding).toBeUndefined();
    const mid = (b: { y: number; h: number }) => b.y + b.h / 2;
    expect(mid(initials!.box)).toBeCloseTo(mid(circle!.box), 5);
  });

  it("uses the résumé photo instead of initials when there is one", () => {
    const withPhoto = buildVideoOutline({ ...content, basics: { ...content.basics, image: "https://cdn.example/dana.jpg" } });
    const els = outlineToVideoScript(withPhoto, t).scenes[1].sceneElements ?? [];
    const photo = els.find((el) => el.id === "build-who-photo");
    expect(photo && photo.kind === "image" ? photo.url : null).toBe("https://cdn.example/dana.jpg");
    expect(els.some((el) => el.id === "build-who-initials")).toBe(false);
  });

  it("shows the résumé page beside the Proof: name, each role, and skills", () => {
    const page = script.scenes[2].sceneElements ?? [];
    const text = (id: string) => {
      const el = page.find((e) => e.id === id);
      return el && el.kind === "text" ? el.text : null;
    };
    expect(text("build-proof-heading")).toBe("Senior Product Designer");
    expect(text("build-proof-page-name")).toBe("Dana Okafor");
    expect(text("build-proof-page-role-0")).toBe("Senior Product Designer");
    expect(text("build-proof-page-meta-0")).toBe("Hinge Health · 2022–build.video.present");
    expect(text("build-proof-page-meta-1")).toBe("Beaumont Hospital · 2014–2021");
    expect(page.some((e) => e.kind === "chips")).toBe(true);
  });

  it("carries timing + gradients onto the studio canvas (the composition the preview plays)", () => {
    const canvas = scriptToCanvasState(script);
    expect(canvas.scenes[0].backgroundEffect).toBe(script.scenes[0].backgroundEffect);
    const body = canvas.scenes[2].widgets.find((w) => w.visibleFrom !== null);
    expect(body?.motion?.enter.kind).toBeDefined();
    expect(body?.visibleFrom).toBeGreaterThan(0);
  });

  it("names each scene by its plan role, not its v1 type (#2349)", () => {
    const canvas = scriptToCanvasState(script);
    // Hook and Proof share the "achievement" type; their labels must still differ.
    expect(script.scenes.map((s) => s.type)).toEqual(["achievement", "intro", "achievement", "skills", "closing"]);
    expect(canvas.scenes.map((s) => s.label)).toEqual([
      "build.video.scene.hook",
      "build.video.scene.who",
      "build.video.scene.proof",
      "build.video.scene.skills",
      "build.video.scene.next",
    ]);
    // The label is not a text slot: nothing extra is placed on the frame.
    expect(canvas.scenes[0].widgets.some((w) => w.params.kind === "text" && w.params.data.text === "build.video.scene.hook")).toBe(false);
  });

  it("carries the background music track", () => {
    expect(script.video.audio?.track).toBe("corporate-inspire");
  });

  it("lays every scene out as explicit elements, never the generic title slot", () => {
    for (const s of script.scenes) {
      expect(s.title).toBe("");
      expect(s.sceneElements?.length).toBeGreaterThan(0);
    }
  });

  it("localizes copy through t (same copy the preview player shows)", () => {
    const who = sceneCopy(outline.scenes[1], outline, t);
    expect(who.label).toBe("build.video.scene.who");
    expect(who.caption).toContain("build.video.caption.who");
    const heading = script.scenes[4].sceneElements?.find((el) => el.id === "build-next-heading");
    expect(heading && heading.kind === "text" ? heading.text : null).toBe("build.video.nextHeading");
  });
});

describe("sceneStarts / formatClock", () => {
  it("offsets each scene by the durations before it", () => {
    const outline = buildVideoOutline(content);
    expect(sceneStarts(outline)).toEqual([0, 5, 11, 18, 24]);
  });

  it("formats seconds as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(8)).toBe("0:08");
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(75.4)).toBe("1:15");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("toHeadline", () => {
  it("keeps a short line as-is (whitespace collapsed)", () => {
    expect(toHeadline("Cut  onboarding time by 40%")).toBe("Cut onboarding time by 40%");
  });

  it("takes the first clause of a long bullet when it fits", () => {
    const bullet =
      "Increased team size from 60 to 75 (offshore & MSP resources; a 25-70% hourly billable reduction) while shipping 200 features";
    const out = toHeadline(bullet);
    expect(out.length).toBeLessThanOrEqual(HOOK_MAX);
    expect(out).toBe("Increased team size from 60 to 75");
  });

  it("cuts on a word boundary with an ellipsis when no clause fits", () => {
    const long = "word ".repeat(40).trim();
    const out = toHeadline(long);
    expect(out.length).toBeLessThanOrEqual(HOOK_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
});

describe("the video plan (content.meta.video)", () => {
  const HINGE = "c0ffee00-0000-4000-8000-000000000042";
  const BEAUMONT = workItemKey({}, 0); // no id → positional key

  it("is read from the résumé, so a stored plan shapes the video", () => {
    const plan: VideoPlan = { scenes: { skills: { off: true }, proof: { duration: 9 } } };
    const outline = buildVideoOutline(withVideoPlan(content, plan));
    expect(outline.scenes.map((s) => s.id)).toEqual(["hook", "who", "proof", "next"]);
    expect(outline.scenes.find((s) => s.id === "proof")?.duration).toBe(9);
    expect(outlineDuration(outline)).toBe(24);
  });

  it("never switches every scene off", () => {
    let plan: VideoPlan = {};
    for (const id of VIDEO_SCENE_IDS) plan = patchScenePlan(plan, id, { off: true });
    expect(buildVideoOutline(content, plan).scenes).toHaveLength(5);
  });

  it("shows only the chosen Proof roles, headline from the first", () => {
    const outline = buildVideoOutline(content, { scenes: { proof: { roles: [BEAUMONT] } } });
    expect(outline.history.map((r) => r.company)).toEqual(["Beaumont Hospital"]);
    const proof = outline.scenes.find((s) => s.id === "proof");
    expect(proof?.title).toBe("Registered Nurse");
    expect(proof?.lines[0]).toBe("Beaumont Hospital");
    expect(proof?.lines).toContain("Precepted new grads");
  });

  it("falls back to the latest roles when the chosen ones were deleted", () => {
    const outline = buildVideoOutline(content, { scenes: { proof: { roles: ["gone"] } } });
    expect(outline.history.map((r) => r.company)).toEqual(["Hinge Health", "Beaumont Hospital"]);
    expect(HINGE).toBe(content.work?.[1]?.id);
  });

  it("unlinked wording replaces the page's text in the scene, verbatim", () => {
    const outline = buildVideoOutline(content, { scenes: { next: { title: "Hiring me?", lines: ["Let's talk"] } } });
    const next = outline.scenes.find((s) => s.id === "next")!;
    expect(next.linked).toBe(false);
    const copy = sceneCopy(next, outline, t);
    expect(copy.heading).toBe("Hiring me?");
    expect(copy.body).toEqual(["Let's talk"]);
  });

  it("linked scenes follow page edits", () => {
    const edited = { ...content, basics: { ...content.basics, name: "Dana O." } };
    const who = buildVideoOutline(edited).scenes.find((s) => s.id === "who")!;
    expect(who.linked).toBe(true);
    expect(who.title).toBe("Dana O.");
  });

  it("applies a scene's look and the music choice to the script", () => {
    const script = outlineToVideoScript(
      buildVideoOutline(content, { scenes: { hook: { look: "forest" } }, music: "none" }),
      t,
    );
    expect(script.scenes[0].backgroundEffect).toBe("gradient:#047857:#0F766E");
    expect(script.video.audio).toBeUndefined();
    const ambient = outlineToVideoScript(buildVideoOutline(content, { music: "tech-ambient" }), t);
    expect(ambient.video.audio?.track).toBe("tech-ambient");
  });
  it("wears the default theme, unless a scene picked its own look", () => {
    const outline = buildVideoOutline(content, { scenes: { proof: { look: "forest" } } }, { themeId: "halloween", line: "No tricks. Just results." });
    const script = outlineToVideoScript(outline, t);
    expect(script.scenes[0].backgroundEffect).toBe("gradient:#1C1917:#7C2D12");
    const proof = script.scenes.find((s) => s.id.includes("proof"))!;
    expect(proof.backgroundEffect).toBe("gradient:#047857:#0F766E");
    expect(outline.theme).toEqual({ id: "halloween", line: "No tricks. Just results." });
  });

  it("drops the event's line when the person picked another theme", () => {
    const outline = buildVideoOutline(content, { themeId: "clean" }, { themeId: "halloween", line: "No tricks. Just results." });
    expect(outline.theme).toEqual({ id: "clean", line: "" });
  });

  it("puts the targeting badge on the Hook kicker, the line under it, and the start on What's next", () => {
    const outline = buildVideoOutline(
      content,
      { targeting: { goal: "contract", audience: "hiringManager", start: "immediately" } },
      { themeId: "halloween", line: "No tricks. Just results.", ownWords: "I hand back the savings." },
    );
    const hook = sceneCopy(outline.scenes.find((s) => s.id === "hook")!, outline, t);
    expect(hook.kicker).toBe("build.video.badge.goal.contract · build.video.badge.audience.hiringManager");
    expect(hook.label).toBe("build.video.scene.hook");
    expect(hook.caption).toBe("No tricks. Just results.");
    const who = sceneCopy(outline.scenes.find((s) => s.id === "who")!, outline, t);
    expect(who.caption).toBe("I hand back the savings.");
    const next = sceneCopy(outline.scenes.find((s) => s.id === "next")!, outline, t);
    expect(next.body).toContain("build.video.start.immediately");
  });

  it("cuts the video to the chosen shape", () => {
    for (const [aspect, size] of [["9:16", { width: 1080, height: 1920 }], ["1:1", { width: 1080, height: 1080 }]] as const) {
      const script = outlineToVideoScript(buildVideoOutline(content, { aspect }), t);
      expect(script.video.aspect).toBe(aspect);
      const canvas = scriptToCanvasState(script);
      expect({ width: canvas.width, height: canvas.height }).toEqual(size);
      // Every element stays inside the frame.
      for (const scene of script.scenes) {
        for (const el of scene.sceneElements ?? []) {
          expect(el.box.x + el.box.w).toBeLessThanOrEqual(100.5);
          expect(el.box.y + el.box.h).toBeLessThanOrEqual(100.5);
        }
      }
    }
  });
});
