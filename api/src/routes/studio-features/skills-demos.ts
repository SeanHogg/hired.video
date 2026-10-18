/**
 * Studio features — skills demonstration videos. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import {
  createSkillsDemo,
  listOwnSkillsDemos,
  listPublicSkillsDemos,
  updateSkillsDemo,
} from "../../services/studio/skills-demos.js";
import { success, error } from "../../types/index.js";
import { validateJson } from "../helpers/validate.js";

export const skillsDemoRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  8. SKILLS DEMONSTRATION VIDEOS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/skills-demo — create a skills demo
skillsDemoRoutes.post("/skills-demo", validateJson(z.object({
    skillName: z.string().min(1).max(100),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]).default("general"),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    projectUrl: z.string().optional(),
    recordingId: UuidLikeSchema.optional(),
    projectId: UuidLikeSchema.optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");


  const demo = await createSkillsDemo({
    userId: user.sub,
    skillName: body.skillName,
    template: body.template,
    title: body.title,
    description: body.description ?? null,
    projectUrl: body.projectUrl ?? null,
    recordingId: body.recordingId ?? null,
    projectId: body.projectId ?? null,
  });

  return c.json(success(demo), 201);
});

// PATCH /api/studio/skills-demo/:id — update with video URL, thumbnail, publish
skillsDemoRoutes.patch("/skills-demo/:id", validateJson(z.object({
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationMs: z.number().optional(),
    isPublic: z.boolean().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const demoId = c.req.param("id");
  const body = c.req.valid("json");


  return c.json(success(await updateSkillsDemo(user.sub, demoId, body)));
});

// GET /api/studio/skills-demos — list user's skills demos
skillsDemoRoutes.get("/skills-demos", async (c) => {
  const user = c.var.user;
  return c.json(success(await listOwnSkillsDemos(user.sub)));
});

// GET /api/studio/skills-demos/user/:userId — public skills demos for a user profile
skillsDemoRoutes.get("/skills-demos/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  return c.json(success(await listPublicSkillsDemos(userId)));
});

// POST /api/studio/skills-demo/generate-script — AI-generate a walkthrough script
skillsDemoRoutes.post("/skills-demo/generate-script", validateJson(z.object({
    skillName: z.string(),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]),
    projectUrl: z.string().optional(),
    projectDescription: z.string().optional(),
    resumeText: z.string().optional(),
  }), () => error("VALIDATION_ERROR", "Invalid request"), { emptyBody: null }), async (c) => {
  const user = c.var.user;
  const body = c.req.valid("json");


  if (!hasAnyLLMProviderKey(c.env)) return c.json(error("AI_UNAVAILABLE", "AI not configured"), 503);

  const templatePrompts: Record<string, string> = {
    general: "a professional skills demonstration",
    "code-walkthrough": "a code walkthrough showing the architecture, key decisions, and technical highlights",
    "design-portfolio": "a design portfolio walkthrough covering the design process, decisions, and final outcomes",
    "data-analysis": "a data analysis presentation covering methodology, key findings, and business impact",
  };

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { content } = await llm.callText("studio_skills_demo_script", {
      useCase: "studio_script",
      systemPrompt: `You are a professional video script writer for ${templatePrompts[body.template] ?? "a skills demo"}.
Generate a structured script the person can read while recording their screen + webcam.
Return JSON: {
  "title": "...",
  "sections": [
    {"heading": "...", "duration_sec": 15, "teleprompter_text": "What to say word-for-word", "screen_instruction": "What to show on screen"}
  ],
  "total_duration_sec": 60
}
Aim for 60-90 seconds total. 3-5 sections.`,
      userMessage: `Skill: ${body.skillName}
Project URL: ${body.projectUrl ?? "N/A"}
Project description: ${body.projectDescription ?? "N/A"}
Resume context: ${(body.resumeText ?? "").slice(0, 2000)}`,
    });
    const script = JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, ""));
    return c.json(success(script));
  } catch (err) {
    // LLM dispatch failures get the typed AI_* envelope (correlationId +
    // upgrade banner); a JSON.parse / other non-AI failure keeps the
    // SCRIPT_GENERATION_FAILED shape.
    const envelope = buildAIErrorEnvelope(err);
    if (envelope) {
      return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
    }
    return c.json(error("SCRIPT_GENERATION_FAILED", `Failed: ${err}`), 500);
  }
});
