/**
 * Unit tests for scene text → résumé (lib/build/scene-text.ts): editing a
 * linked scene's words edits the page field it was derived from (and the
 * re-derived scene shows the new words); fields without a source fall back
 * to the scene's own unlinked wording in the video plan.
 */
import { describe, it, expect } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { buildVideoOutline, type VideoSceneId } from "@/lib/build/video-outline";
import { sceneTextFieldOfWidget, writeSceneText } from "@/lib/build/scene-text";
import { readVideoPlan, withVideoPlan, workItemKey, type VideoPlan } from "@shared/video-plan";

const HINGE = "c0ffee00-0000-4000-8000-000000000042";

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
      id: HINGE,
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

const HEADING = { kind: "heading" } as const;
const line = (index: number) => ({ kind: "line", index }) as const;
const sceneOf = (c: ResumeContent, id: VideoSceneId) => buildVideoOutline(c).scenes.find((s) => s.id === id)!;

describe("sceneTextFieldOfWidget", () => {
  it("maps heading, body and skill-pill widgets to their field", () => {
    expect(sceneTextFieldOfWidget("build-hook-heading")).toEqual({ sceneId: "hook", field: HEADING });
    expect(sceneTextFieldOfWidget("build-proof-body-2")).toEqual({ sceneId: "proof", field: line(2) });
    expect(sceneTextFieldOfWidget("build-skills-skill-4")).toEqual({ sceneId: "skills", field: line(4) });
  });

  it("ignores widgets that are not scene text", () => {
    for (const id of ["build-who-avatar", "build-who-caption", "build-hook-kicker", "build-proof-page-role-0", "build-skills-body-0", "build-who-skill-1", "build-resume-heading", "x"]) {
      expect(sceneTextFieldOfWidget(id), id).toBeNull();
    }
  });
});

describe("writeSceneText — linked scenes edit the résumé", () => {
  it("hook headline → the bullet it was cut from", () => {
    const next = writeSceneText(content, "hook", HEADING, "Lifted 30-day activation 31% with a guided first session");
    expect(next.work[1].highlights[1]).toBe("Lifted 30-day activation 31% with a guided first session");
    const hook = sceneOf(next, "hook");
    expect(hook.title).toBe("Lifted 30-day activation 31% with a guided first session");
    expect(hook.linked).toBe(true);
    expect(next.meta?.video).toBeUndefined();
  });

  it("hook headline cut from a long bullet keeps the rest of that bullet", () => {
    const long = ResumeContentSchema.parse({
      work: [{
        name: "Acme",
        position: "Engineering Manager",
        highlights: ["Increased team size from 60 to 75 (offshore & MSP resources; a 25-70% hourly billable reduction) while shipping 200 features"],
      }],
    });
    expect(sceneOf(long, "hook").title).toBe("Increased team size from 60 to 75");
    const next = writeSceneText(long, "hook", HEADING, "Grew the team from 60 to 75");
    expect(next.work[0].highlights[0]).toBe(
      "Grew the team from 60 to 75 (offshore & MSP resources; a 25-70% hourly billable reduction) while shipping 200 features",
    );
    expect(sceneOf(next, "hook").title).toBe("Grew the team from 60 to 75");
  });

  it("hook headline from the summary → that sentence of basics.summary", () => {
    const noBullets = { ...content, work: content.work.map((w) => ({ ...w, highlights: [] })) };
    expect(sceneOf(noBullets, "hook").title).toBe("Designer who ships.");
    const next = writeSceneText(noBullets, "hook", HEADING, "Nurse turned designer.");
    expect(next.basics?.summary).toBe("Nurse turned designer. Former ICU nurse.");
    expect(sceneOf(next, "hook").title).toBe("Nurse turned designer.");
  });

  it("who headline → basics.name; who line 0 → the latest role's position", () => {
    const named = writeSceneText(content, "who", HEADING, "Dana O.");
    expect(named.basics?.name).toBe("Dana O.");
    expect(sceneOf(named, "who").title).toBe("Dana O.");

    const retitled = writeSceneText(content, "who", line(0), "Staff Product Designer");
    expect(retitled.work[1].position).toBe("Staff Product Designer");
    expect(retitled.work[0].position).toBe("Registered Nurse");
    expect(sceneOf(retitled, "who").lines[0]).toBe("Staff Product Designer");
    expect(sceneOf(retitled, "who").linked).toBe(true);
  });

  it("who line 0 → basics.label when there is no work history", () => {
    const noWork = { ...content, work: [] };
    const next = writeSceneText(noWork, "who", line(0), "UX Lead");
    expect(next.basics?.label).toBe("UX Lead");
    expect(sceneOf(next, "who").lines[0]).toBe("UX Lead");
  });

  it("proof headline, company and bullets → the lead role and its highlights", () => {
    const proof = sceneOf(content, "proof");
    expect(proof.lines[0]).toBe("Hinge Health");

    const position = writeSceneText(content, "proof", HEADING, "Design Lead");
    expect(position.work[1].position).toBe("Design Lead");
    expect(sceneOf(position, "proof").title).toBe("Design Lead");

    const company = writeSceneText(content, "proof", line(0), "Hinge Health Inc.");
    expect(company.work[1].name).toBe("Hinge Health Inc.");
    expect(sceneOf(company, "proof").lines[0]).toBe("Hinge Health Inc.");

    const bullet = proof.lines[1];
    const bulletIndex = content.work[1].highlights.indexOf(bullet);
    expect(bulletIndex).toBeGreaterThanOrEqual(0);
    const edited = writeSceneText(content, "proof", line(1), `${bullet} across 3 apps`);
    expect(edited.work[1].highlights[bulletIndex]).toBe(`${bullet} across 3 apps`);
    expect(sceneOf(edited, "proof").lines).toContain(`${bullet} across 3 apps`);
    expect(sceneOf(edited, "proof").linked).toBe(true);
  });

  it("proof follows the chosen roles", () => {
    const plan: VideoPlan = { scenes: { proof: { roles: [workItemKey({}, 0)] } } };
    const chosen = withVideoPlan(content, plan);
    const next = writeSceneText(chosen, "proof", HEADING, "Charge Nurse");
    expect(next.work[0].position).toBe("Charge Nurse");
    expect(next.work[1].position).toBe("Senior Product Designer");
    expect(readVideoPlan(next)).toEqual(plan);
  });

  it("skills line → renames every exact occurrence of that skill", () => {
    const next = writeSceneText(content, "skills", line(0), "Figma Pro");
    expect(next.skills[0].name).toBe("Figma Pro");
    expect(next.skills[2].keywords).toEqual(["Tokens", "Accessibility", "Figma Pro"]);
    const lines = sceneOf(next, "skills").lines;
    expect(lines[0]).toBe("Figma Pro");
    expect(lines).not.toContain("Figma");

    const keyword = writeSceneText(content, "skills", line(3), "Rapid prototyping");
    expect(keyword.skills[0].keywords).toEqual(["Rapid prototyping"]);
    expect(sceneOf(keyword, "skills").lines[3]).toBe("Rapid prototyping");
  });
});

describe("writeSceneText — no source → the scene's own wording", () => {
  it("who location line unlinks, keeping the headline", () => {
    const next = writeSceneText(content, "who", line(1), "Remote · Detroit");
    expect(next.basics).toEqual(content.basics);
    const who = sceneOf(next, "who");
    expect(who.linked).toBe(false);
    expect(who.title).toBe("Dana Okafor");
    expect(who.lines).toEqual(["Senior Product Designer", "Remote · Detroit"]);
  });

  it("next scene and the skills heading are localized copy → unlinked", () => {
    const next = writeSceneText(content, "next", HEADING, "Let's build together");
    expect(readVideoPlan(next).scenes?.next).toEqual({ title: "Let's build together", lines: ["Senior Product Designer"] });
    expect(next.basics).toEqual(content.basics);

    const skills = writeSceneText(content, "skills", HEADING, "What I bring");
    expect(readVideoPlan(skills).scenes?.skills).toEqual({ title: "What I bring", lines: ["Figma", "User research", "Design systems"] });
    expect(skills.skills).toEqual(content.skills);
  });

  it("a hook with neither bullets nor summary unlinks", () => {
    const bare = { ...content, basics: { ...content.basics!, summary: "" }, work: content.work.map((w) => ({ ...w, highlights: [] })) };
    const next = writeSceneText(bare, "hook", HEADING, "Hire a designer who ships");
    expect(sceneOf(next, "hook")).toMatchObject({ title: "Hire a designer who ships", linked: false });
  });

  it("a line the scene doesn't have yet is added to its own wording", () => {
    const next = writeSceneText(content, "hook", line(0), "Ex-ICU nurse");
    expect(sceneOf(next, "hook")).toMatchObject({ linked: false, lines: ["Ex-ICU nurse"] });
    expect(next.work).toEqual(content.work);
  });

  it("an already-unlinked scene keeps editing its override, not the résumé", () => {
    const unlinked = withVideoPlan(content, { scenes: { who: { title: "Hi, I'm Dana", lines: ["Designer"] } } });
    const next = writeSceneText(unlinked, "who", HEADING, "Hello, I'm Dana");
    expect(next.basics?.name).toBe("Dana Okafor");
    expect(readVideoPlan(next).scenes?.who).toEqual({ title: "Hello, I'm Dana", lines: ["Designer"] });
  });

  it("keeps the override within the plan's limits", () => {
    const next = writeSceneText(content, "next", HEADING, "x".repeat(300));
    expect(readVideoPlan(next).scenes?.next?.title).toHaveLength(160);
    expect(writeSceneText(content, "next", line(5), "too far")).toBe(content);
  });

  it("edits a switched-off scene too", () => {
    const off = withVideoPlan(content, { scenes: { who: { off: true } } });
    const next = writeSceneText(off, "who", HEADING, "Dana O.");
    expect(next.basics?.name).toBe("Dana O.");
    expect(readVideoPlan(next).scenes?.who).toEqual({ off: true });
  });
});
