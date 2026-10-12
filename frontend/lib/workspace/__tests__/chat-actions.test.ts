import { describe, expect, it } from "vitest";
import { BUILD_STAGES } from "@/lib/build/build-stages";
import { toolsForStage } from "@/lib/build/stage-tools";
import { CHAT_ACTIONS, STUDIO_CHAT_ACTIONS, chatActionsFor, type ChatActionDef } from "../chat-actions";

const CAN = { generate: true };
const ids = (actions: readonly ChatActionDef[]) => actions.map((a) => a.id);

describe("chat actions registry", () => {
  it("gives every action a unique id", () => {
    expect(new Set(ids(CHAT_ACTIONS)).size).toBe(CHAT_ACTIONS.length);
  });

  it.each(BUILD_STAGES.map((stage) => [stage]))("offers the %s stage's résumé tools in the kit Chat, in catalog order", (stage) => {
    const tools = chatActionsFor({ surface: "kit", stage, page: "resume", can: CAN }).filter((a) => a.run.kind === "tool");
    expect(tools.map((a) => (a.run.kind === "tool" ? a.run.toolId : ""))).toEqual(toolsForStage(stage).map((e) => e.id));
  });

  it("puts the studio's AI tools beside them on the kit's video page", () => {
    const actions = ids(chatActionsFor({ surface: "kit", stage: "video", page: "video", can: CAN }));
    expect(actions).toEqual(expect.arrayContaining(["generateImage", "sceneHook", "sceneShorter"]));
    // Résumé tools come first.
    const firstStudio = actions.findIndex((id) => !id.startsWith("tool:"));
    expect(actions.slice(firstStudio).every((id) => !id.startsWith("tool:"))).toBe(true);
  });

  it("keeps video-only studio tools off the résumé and letter pages", () => {
    for (const page of ["resume", "letter"] as const) {
      const actions = chatActionsFor({ surface: "kit", stage: "create", page, can: CAN });
      expect(actions.every((a) => a.run.kind === "tool"), page).toBe(true);
    }
  });

  it("drops Generate when the host has nothing to put an image on", () => {
    const kit = ids(chatActionsFor({ surface: "kit", stage: "video", page: "video", can: { generate: false } }));
    expect(kit).not.toContain("generateImage");
    const studio = ids(chatActionsFor({ surface: "studio", family: "timeline", can: { generate: false } }));
    expect(studio).not.toContain("generateImage");
  });

  it("offers a timeline format the studio's AI tools and no résumé tools", () => {
    const actions = chatActionsFor({ surface: "studio", family: "timeline", can: CAN });
    expect(ids(actions)).toEqual(["generateImage", "sceneHook", "sceneShorter", "addScene", "recordScreen"]);
    expect(actions.some((a) => a.run.kind === "tool")).toBe(false);
  });

  it("offers an image format nothing (its generator lives on the canvas)", () => {
    expect(chatActionsFor({ surface: "studio", family: "image", can: CAN })).toEqual([]);
  });

  it("shows an action added once in both surfaces", () => {
    const shared: ChatActionDef = {
      id: "both",
      labelKey: "x",
      icon: () => null,
      run: { kind: "prompt", promptKey: "y" },
      where: { kit: { pages: ["video"] }, studio: ["timeline"] },
    };
    const registry = [...STUDIO_CHAT_ACTIONS, shared];
    expect(ids(chatActionsFor({ surface: "kit", stage: "video", page: "video", can: CAN }, registry))).toContain("both");
    expect(ids(chatActionsFor({ surface: "studio", family: "timeline", can: CAN }, registry))).toContain("both");
    expect(ids(chatActionsFor({ surface: "studio", family: "game", can: CAN }, registry))).not.toContain("both");
  });
});
