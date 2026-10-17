// Studio video-draft runners: a video from a template + the user's content,
// and (SuperAdmin) a video from the current page. Both stage a pending
// mutation; commit.ts persists the draft.

import {
  TEMPLATE_CATALOG,
  getTemplate,
  type ContentTemplate,
} from "@/lib/studio/templates/catalog";
import { seedCanvasFromTemplate } from "@/lib/studio/editor-v2/template-seeds";
import { hydrateCanvasState } from "@/lib/studio/editor-v2/hydrate-canvas-state";
import { templateBinder } from "@/lib/studio/editor-v2/template-content-slots";
import { harvestCurrentPage } from "@/lib/studio/page-harvest";
import { resolveUserContent } from "@/lib/studio/editor-v2/resolve-user-content";
import { studioService } from "@/lib/services/studio-service";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";
import { asString } from "./shared";
import { lookupTool } from "./tool-lookup";

// ── Studio: generate a video from a template using user content ────────────
//
// The AI CHRO's entry point into the V2 Studio. Given a templateId, the
// runner pulls the user's resume + profile via `resolveUserContent`,
// substitutes the template's declared slot placeholders with that
// content, and stages the hydrated `CanvasState` as a pending mutation.
// commitMutation persists it as an `nle`-kind StudioProject draft and
// the ToolCallCard surfaces an Open link to the V2 editor.
//
// V1 is dead per the V2-only editor preference — we never write `script`
// for these drafts.

export const TEMPLATE_ID_VALUES = TEMPLATE_CATALOG.map((t) => t.id) as ContentTemplate[];

export async function runGenerateVideoFromTemplate(
  ctx: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const raw = ctx.args.templateId;
  const templateId = typeof raw === "string" && TEMPLATE_ID_VALUES.includes(raw as ContentTemplate)
    ? (raw as ContentTemplate)
    : undefined;
  if (!templateId) {
    throw new Error(
      `generate_video_from_template requires \`templateId\` — one of: ${TEMPLATE_ID_VALUES.join(", ")}.`,
    );
  }
  const template = getTemplate(templateId);
  // Picker args (#689): which owned job / company / résumé project / clips /
  // catalog tool the template features. The surface's bound job / company
  // wins over the model's pick (the user is looking at it).
  const toolId = asString(ctx.args.toolId);
  const toolDef = toolId ? lookupTool(toolId) : undefined;
  const userContent = await resolveUserContent({
    preferredResumeId: ctx.bound.resumeId,
    sources: templateBinder(templateId)?.sources ?? [],
    jobId: ctx.bound.jobId ?? asString(ctx.args.jobId),
    companyId: ctx.bound.companyId ?? asString(ctx.args.companyId),
    projectName: asString(ctx.args.projectName),
    clipIds: Array.isArray(ctx.args.clipIds)
      ? ctx.args.clipIds.filter((v): v is string => typeof v === "string")
      : undefined,
    tool: toolDef
      ? {
          label: toolDef.label,
          description: toolDef.description,
          url: `${typeof window !== "undefined" ? window.location.origin : ""}${toolDef.route}`,
        }
      : undefined,
  });

  const seeded = seedCanvasFromTemplate(templateId);
  const hydrated = hydrateCanvasState(seeded, templateId, userContent);

  const name = asString(ctx.args.name) ?? template.defaultName;
  const prompt = asString(ctx.args.prompt);

  // Build a human-readable preview so the user sees what will land on
  // the canvas before they click Apply.
  const previewLines: string[] = [`Template: ${template.label}`];
  const filledFields: string[] = [];
  if (userContent.profile?.name) filledFields.push(`name=${userContent.profile.name}`);
  if (userContent.profile?.headline) filledFields.push(`headline=${userContent.profile.headline}`);
  if (userContent.resume?.work?.length) filledFields.push(`work=${userContent.resume.work.length} role${userContent.resume.work.length === 1 ? "" : "s"}`);
  if (userContent.resume?.skills?.length) filledFields.push(`skills=${userContent.resume.skills.length}`);
  if (userContent.project) filledFields.push(`project=${userContent.project.name}`);
  if (userContent.job) filledFields.push(`job=${userContent.job.title}`);
  if (userContent.company) filledFields.push(`company=${userContent.company.name}`);
  if (userContent.clips?.length) filledFields.push(`clips=${userContent.clips.length}`);
  if (userContent.tool) filledFields.push(`tool=${userContent.tool.label}`);
  if (filledFields.length > 0) {
    previewLines.push(`Filled from your content: ${filledFields.join(", ")}`);
  } else {
    previewLines.push("No resume / profile content found — opening with placeholder text.");
  }
  if (prompt) previewLines.push(`Prompt: ${prompt}`);

  return {
    summary: `Create a new "${template.label}" video draft, pre-filled with your content.`,
    previewText: previewLines.join("\n"),
    mutation: { status: "pending", location: "studio" },
    raw: {
      kind: "generate_video_from_template",
      templateId,
      name,
      prompt,
      purpose: template.purpose,
      hydrated,
    },
  };
}

// ── Studio: generate a video from the CURRENT PAGE (SuperAdmin) ──────────────
// #1860. The Brain harvests the live marketing page (DOM headings, body
// copy, content images, CTAs, the route's PAGE_SEO positioning), posts it
// to the SuperAdmin-gated scaffolder, and stages the returned
// `PageVideoSpec` as a pending mutation. commitMutation hydrates the spec
// into a CanvasState and persists it as an `nle` video draft, then the
// ToolCallCard surfaces an Open link to the Studio editor for review.
export async function runGenerateVideoFromPage(
  ctx: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const page = harvestCurrentPage();
  if (!page) {
    throw new Error("Can't read the current page — open this on a rendered page and try again.");
  }
  const { data } = await studioService.generatePageVideo(page);
  const spec = data.spec;
  const name = asString(ctx.args.name) ?? spec.title ?? `Video — ${page.title || page.pathname}`;

  const previewLines: string[] = [
    `Source: ${page.pathname}`,
    `Scenes: ${spec.scenes.length} (${spec.scenes.map((s) => s.kind).join(" → ")})`,
    `Format: ${spec.aspect}`,
  ];
  const firstHook = spec.scenes.find((s) => s.kind === "hook");
  if (firstHook) previewLines.push(`Hook: "${firstHook.headline}"`);

  return {
    summary: `Drafted a ${spec.scenes.length}-scene video from ${page.pathname}. Apply to open it in Studio for review.`,
    previewText: previewLines.join("\n"),
    mutation: { status: "pending", location: "studio" },
    raw: {
      kind: "generate_video_from_page",
      name,
      sourcePath: page.pathname,
      spec,
    },
  };
}
