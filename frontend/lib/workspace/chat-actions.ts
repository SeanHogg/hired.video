/**
 * The ONE registry of AI work you can ask for from a workspace's chat — the
 * kit's Chat and a studio format's AI tab both read it, so an action added
 * here shows wherever its `where` says, in both surfaces, with no new branch
 * in either.
 *
 *   tool      a catalog AI Tool (TOOLS_CATALOG `buildStage`): runs in the
 *             chat or opens its page in the slide-out (stage-tools.ts).
 *             Billing is the tool's own (useToolRuns / useToolPanel).
 *   prompt    a request typed into the surface's chat for you (the kit's
 *             revise-in-place chat; the studio's AI thread, whose studio_*
 *             tools drive the editor).
 *   generate  the image generator (MediaAiPromptPanel → useMediaAiPrompt,
 *             whose anon gate is unchanged); the host inserts the result.
 *
 * The résumé tools come from the tools catalog (one entry per tool there);
 * the studio's AI tools are declared below. Pure (no React).
 */
import type { ComponentType } from "react";
import { Clapperboard, ImagePlus, MonitorUp, Scissors, Sparkles } from "lucide-react";
import { TOOLS_CATALOG } from "@/data/tools-catalog";
import type { BuildStageId } from "@/lib/build/build-stages";
import type { KitPage } from "./kit-stages";
import type { StudioToolFamily } from "./studio-tool-slots";

export type ChatActionRun =
  | { kind: "tool"; toolId: string }
  | { kind: "prompt"; promptKey: string }
  | { kind: "generate"; media: "image" };

export type ChatActionKind = ChatActionRun["kind"];

/** Where an action is offered. Omitted = not on that surface; an empty
 *  `pages` / `stages` list never matches. */
export interface ChatActionWhere {
  kit?: { pages?: readonly KitPage[]; stages?: readonly BuildStageId[] };
  studio?: readonly StudioToolFamily[];
}

export interface ChatActionDef {
  id: string;
  /** i18n key of the chip label (catalog tools use their localized title). */
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  run: ChatActionRun;
  where: ChatActionWhere;
}

/** What the host can do right now (e.g. no frame to put an image on yet). */
export interface ChatActionCapabilities {
  generate: boolean;
}

export type ChatActionContext =
  | { surface: "kit"; stage: BuildStageId; page: KitPage; can: ChatActionCapabilities }
  | { surface: "studio"; family: StudioToolFamily; can: ChatActionCapabilities };

const TIME_BASED: readonly StudioToolFamily[] = ["timeline"];
const MAKES_IMAGES: readonly StudioToolFamily[] = ["timeline", "document", "game", "animation", "other"];

/** The studio's AI tools, as chat actions. */
export const STUDIO_CHAT_ACTIONS: readonly ChatActionDef[] = [
  {
    id: "generateImage",
    labelKey: "workspace.chatAction.generateImage",
    icon: ImagePlus,
    run: { kind: "generate", media: "image" },
    where: { kit: { pages: ["video"] }, studio: MAKES_IMAGES },
  },
  {
    id: "sceneHook",
    labelKey: "workspace.chatAction.sceneHook",
    icon: Sparkles,
    run: { kind: "prompt", promptKey: "workspace.chatAction.sceneHookPrompt" },
    where: { kit: { pages: ["video"] }, studio: TIME_BASED },
  },
  {
    id: "sceneShorter",
    labelKey: "workspace.chatAction.sceneShorter",
    icon: Scissors,
    run: { kind: "prompt", promptKey: "workspace.chatAction.sceneShorterPrompt" },
    where: { kit: { pages: ["video"] }, studio: TIME_BASED },
  },
  {
    id: "addScene",
    labelKey: "workspace.chatAction.addScene",
    icon: Clapperboard,
    run: { kind: "prompt", promptKey: "workspace.chatAction.addScenePrompt" },
    where: { studio: TIME_BASED },
  },
  {
    id: "recordScreen",
    labelKey: "workspace.chatAction.recordScreen",
    icon: MonitorUp,
    run: { kind: "prompt", promptKey: "workspace.chatAction.recordScreenPrompt" },
    where: { studio: TIME_BASED },
  },
];

/** Every catalog AI Tool with a `buildStage`, offered at that stage of a kit. */
export const TOOL_CHAT_ACTIONS: readonly ChatActionDef[] = TOOLS_CATALOG.flatMap((entry) =>
  entry.buildStage
    ? [
        {
          id: `tool:${entry.id}`,
          labelKey: `tools.card.${entry.id}.title`,
          icon: entry.icon,
          run: { kind: "tool", toolId: entry.id } as const,
          where: { kit: { stages: [entry.buildStage] } },
        },
      ]
    : [],
);

/** Résumé tools first (the stage's own work), then the studio's. */
export const CHAT_ACTIONS: readonly ChatActionDef[] = [...TOOL_CHAT_ACTIONS, ...STUDIO_CHAT_ACTIONS];

const NEEDS: Record<ChatActionKind, (can: ChatActionCapabilities) => boolean> = {
  tool: () => true,
  prompt: () => true,
  generate: (can) => can.generate,
};

function offeredIn(where: ChatActionWhere, ctx: ChatActionContext): boolean {
  if (ctx.surface === "studio") return where.studio?.includes(ctx.family) ?? false;
  const kit = where.kit;
  if (!kit) return false;
  return (!kit.pages || kit.pages.includes(ctx.page)) && (!kit.stages || kit.stages.includes(ctx.stage));
}

/** The actions a chat offers here, in registry order. */
export function chatActionsFor(ctx: ChatActionContext, actions: readonly ChatActionDef[] = CHAT_ACTIONS): ChatActionDef[] {
  return actions.filter((action) => offeredIn(action.where, ctx) && NEEDS[action.run.kind](ctx.can));
}
