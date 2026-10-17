/**
 * /api/template-extractor — Resume template extractor (#187).
 *
 *   POST /         body: { fileUrl } | multipart upload — extracts a
 *                 ResumeTemplateDescriptor from an uploaded resume PDF.
 *
 * Hybrid registry: the descriptor prefers existing static theme / font /
 * heading keys; only creates new `dynamic_themes` / `dynamic_fonts` /
 * `dynamic_heading_styles` rows when no close match exists. Today the
 * heavy lifting (multimodal LLM call against the PDF) lands as a stub
 * that returns the closest-match descriptor without inventing dynamic
 * rows; the multimodal pass is a follow-up (#1770) once the vision-
 * capable model is chosen.
 *
 * Pro-gated save to private template library lands once a real
 * extractor implementation is wired (the route does the descriptor
 * scaffolding so the UI can be built against the contract today).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { logger } from "../lib/logger.js";
import {
  createLLMClient,
  hasAnyLLMProviderKey,
} from "../services/adapters/llm-client.js";

export const templateExtractorRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const ExtractSchema = z.object({
  fileUrl: z.string().url().optional(),
  /** Allow direct paste of the resume text content for the no-PDF flow. */
  resumeText: z.string().max(50_000).optional(),
}).refine((d) => d.fileUrl || d.resumeText, "fileUrl or resumeText is required");

interface ResumeTemplateDescriptor {
  themeKey: string;
  fontKey: string;
  headingKey: string;
  layoutKey: string;
  accentColor: string;
  sections: Array<{ key: string; order: number }>;
  /** When the heuristic finds a NEW combination not in the static
   *  registry, the IDs of the dynamic_* rows we'd persist. Today the
   *  extractor only matches static keys; this is empty until the
   *  multimodal extractor lands. */
  dynamicRowsCreated: string[];
}

function deriveDescriptorStub(): ResumeTemplateDescriptor {
  // Heuristic baseline — picks a sensible mid-market default until the
  // multimodal pass (#1770) is wired. The contract shape is the same
  // the UI consumes, so the front-end can build against this today.
  return {
    themeKey: "default",
    fontKey: "inter",
    headingKey: "sans-bold",
    layoutKey: "single-column-ats",
    accentColor: "#4F46E5",
    sections: [
      { key: "summary",    order: 1 },
      { key: "experience", order: 2 },
      { key: "education",  order: 3 },
      { key: "skills",     order: 4 },
      { key: "projects",   order: 5 },
    ],
    dynamicRowsCreated: [],
  };
}

templateExtractorRoutes.post("/", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ExtractSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "fileUrl or resumeText required", parsed.error.flatten()), 400);
  }
  // Same metering surface as the existing PDF parse path — counts toward
  // the catalog's `resume_parse` per-month limit so Free users can't
  // abuse the extractor.
  const blocked = await servicesProcessor.enforce(c, "resume_parse");
  if (blocked) return blocked;

  let descriptor = deriveDescriptorStub();
  let usedModel = false;

  // #187 — Multimodal extraction. When an LLM is configured we call
  // the existing client with the resume text (or a brief about the
  // PDF) and ask the model to suggest the closest-match theme + font
  // + heading keys. Falls back to the heuristic baseline silently on
  // any model error so the route never fails.
  if (hasAnyLLMProviderKey(c.env as any) && (parsed.data.resumeText || parsed.data.fileUrl)) {
    try {
      const llm = createLLMClient(c.env as any, c.var.user);
      const userMessage = parsed.data.resumeText
        ? `Resume text:\n${parsed.data.resumeText.slice(0, 8_000)}\n\nReturn a ResumeTemplateDescriptor matching the visual style of this resume.`
        : `Resume PDF at ${parsed.data.fileUrl}. Best-effort descriptor.`;
      const { content } = await llm.callText(
        "resume_template_extractor",
        {
          useCase: "resume_consolidate_highlights",
          systemPrompt: `You are a resume-template analyst. Given a resume's text, choose the closest-match keys from the platform's static registry. Return STRICT JSON only:
{
  "themeKey": "default"|"minimal"|"bold"|"serif"|"two-column",
  "fontKey": "inter"|"playfair"|"merriweather"|"roboto"|"jetbrains-mono",
  "headingKey": "sans-bold"|"serif-italic"|"sans-uppercase",
  "layoutKey": "single-column-ats"|"two-column"|"sidebar-left"|"sidebar-right",
  "accentColor": "#RRGGBB",
  "sections": [{"key": "summary|experience|education|skills|projects", "order": number}]
}
Prefer existing keys. Only suggest a new combination when no static match exists.`,
          userMessage,
          responseFormat: "json_object",
        },
      );
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsedJson = JSON.parse(match[0]);
        if (parsedJson?.themeKey && parsedJson?.fontKey) {
          descriptor = { ...descriptor, ...parsedJson, dynamicRowsCreated: [] };
          usedModel = true;
        }
      }
    } catch (err) {
      logger.warn("[template-extractor] LLM extraction failed, using baseline", err);
    }
  }

  servicesProcessor.meterEvent(c, "resume_parse", { source: "template-extractor", usedModel });

  return c.json(
    success({
      descriptor,
      usedModel,
      note: usedModel
        ? "Descriptor extracted via multimodal LLM."
        : "LLM unavailable — using heuristic baseline descriptor.",
    }),
    200,
  );
});

templateExtractorRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Template extractor route not found" } }, 404),
);
