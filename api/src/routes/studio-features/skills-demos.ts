/**
 * Studio features — skills demonstration videos. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { AppEnv } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import { ok, fail, studioSkillsDemos } from "./shared.js";

export const skillsDemoRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  8. SKILLS DEMONSTRATION VIDEOS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/studio/skills-demo — create a skills demo
skillsDemoRoutes.post("/skills-demo", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    skillName: z.string().min(1).max(100),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]).default("general"),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    projectUrl: z.string().optional(),
    recordingId: UuidLikeSchema.optional(),
    projectId: UuidLikeSchema.optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [demo] = await db.insert(studioSkillsDemos).values({
    userId: user.sub,
    skillName: parsed.data.skillName,
    template: parsed.data.template,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    projectUrl: parsed.data.projectUrl ?? null,
    recordingId: parsed.data.recordingId ?? null,
    projectId: parsed.data.projectId ?? null,
  } as any).returning();

  return c.json(ok(demo), 201);
});

// PATCH /api/studio/skills-demo/:id — update with video URL, thumbnail, publish
skillsDemoRoutes.patch("/skills-demo/:id", async (c) => {
  const user = c.var.user;
  const demoId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationMs: z.number().optional(),
    isPublic: z.boolean().optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  const db = getDb();
  const [updated] = await db.update(studioSkillsDemos).set({
    ...parsed.data,
    updatedAt: new Date(),
  } as any)
    .where(and(eq(studioSkillsDemos.id, demoId), eq(studioSkillsDemos.userId, user.sub)))
    .returning();

  if (!updated) return c.json(fail("NOT_FOUND", "Demo not found"), 404);
  return c.json(ok(updated));
});

// GET /api/studio/skills-demos — list user's skills demos
skillsDemoRoutes.get("/skills-demos", async (c) => {
  const user = c.var.user;
  const db = getDb();
  const demos = await db.select().from(studioSkillsDemos)
    .where(eq(studioSkillsDemos.userId, user.sub))
    .orderBy(desc(studioSkillsDemos.updatedAt))
    .limit(50);

  return c.json(ok(demos));
});

// GET /api/studio/skills-demos/user/:userId — public skills demos for a user profile
skillsDemoRoutes.get("/skills-demos/user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  const demos = await db.select().from(studioSkillsDemos)
    .where(and(eq(studioSkillsDemos.userId, userId), eq(studioSkillsDemos.isPublic, true)))
    .orderBy(desc(studioSkillsDemos.updatedAt))
    .limit(20);

  return c.json(ok(demos));
});

// POST /api/studio/skills-demo/generate-script — AI-generate a walkthrough script
skillsDemoRoutes.post("/skills-demo/generate-script", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    skillName: z.string(),
    template: z.enum(["general", "code-walkthrough", "design-portfolio", "data-analysis"]),
    projectUrl: z.string().optional(),
    projectDescription: z.string().optional(),
    resumeText: z.string().optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request"), 400);

  if (!hasAnyLLMProviderKey(c.env)) return c.json(fail("AI_UNAVAILABLE", "AI not configured"), 503);

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
      systemPrompt: `You are a professional video script writer for ${templatePrompts[parsed.data.template] ?? "a skills demo"}.
Generate a structured script the person can read while recording their screen + webcam.
Return JSON: {
  "title": "...",
  "sections": [
    {"heading": "...", "duration_sec": 15, "teleprompter_text": "What to say word-for-word", "screen_instruction": "What to show on screen"}
  ],
  "total_duration_sec": 60
}
Aim for 60-90 seconds total. 3-5 sections.`,
      userMessage: `Skill: ${parsed.data.skillName}
Project URL: ${parsed.data.projectUrl ?? "N/A"}
Project description: ${parsed.data.projectDescription ?? "N/A"}
Resume context: ${(parsed.data.resumeText ?? "").slice(0, 2000)}`,
    });
    const script = JSON.parse(content.replace(/```json?\s*/g, "").replace(/```/g, ""));
    return c.json(ok(script));
  } catch (err) {
    // LLM dispatch failures get the typed AI_* envelope (correlationId +
    // upgrade banner); a JSON.parse / other non-AI failure keeps the
    // SCRIPT_GENERATION_FAILED shape.
    const envelope = buildAIErrorEnvelope(err);
    if (envelope) {
      return c.json(fail(envelope.code, envelope.message, envelope.payload), envelope.status);
    }
    return c.json(fail("SCRIPT_GENERATION_FAILED", `Failed: ${err}`), 500);
  }
});
