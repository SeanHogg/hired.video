/**
 * Studio features — AI script rewriter. Mounted at /api/studio through the
 * routes/studio-features.ts barrel (split out of that file; paths unchanged).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../services/adapters/llm-client.js";
import { aiFailure } from "../../services/adapters/llm-error.js";
import { ok, fail } from "./shared.js";

export const scriptRewriterRoutes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════════════════════════
// ██  15. AI SCRIPT REWRITER — gap #144
// ██
// ██  LLM rewrite of an existing storyboard: shorten, change tone, swap persona.
// ██  Returns a new scene array preserving timing constraints.
// ═══════════════════════════════════════════════════════════════════════════════

scriptRewriterRoutes.post("/projects/:projectId/script/rewrite", async (c) => {
  const user = c.var.user;
  const projectId = c.req.param("projectId");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    storyboard: z.unknown(),
    mode: z.enum(["shorten", "lengthen", "tone", "persona"]),
    targetSeconds: z.number().min(5).max(300).optional(),
    tone: z.enum(["professional", "conversational", "enthusiastic", "executive"]).optional(),
    persona: z.enum(["job-seeker", "recruiter", "company-promo", "personal-brand"]).optional(),
    instructions: z.string().max(500).optional(),
  }).safeParse(body);

  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid body", parsed.error.flatten()), 400);

  if (!hasAnyLLMProviderKey(c.env)) return c.json(fail("AI_UNAVAILABLE", "LLM API key not configured"), 503);

  const { mode, targetSeconds, tone, persona, instructions } = parsed.data;

  const directive = (() => {
    switch (mode) {
      case "shorten":
        return `Shorten the script to approximately ${targetSeconds ?? 20} total seconds. Preserve the most impactful scenes and trim wordy narration.`;
      case "lengthen":
        return `Expand the script to approximately ${targetSeconds ?? 45} total seconds. Add concrete examples, transitions, and supporting detail without inventing facts.`;
      case "tone":
        return `Rewrite all narration in a ${tone ?? "professional"} tone. Keep every scene's structure and timing identical — change only the words spoken.`;
      case "persona":
        return `Re-frame the script for a ${persona ?? "job-seeker"} audience. Adjust messaging, calls-to-action, and emphasis while keeping the same scene count and total duration.`;
    }
  })();

  const systemPrompt = `You rewrite video storyboard scripts. You must return ONLY valid JSON matching the input shape. Never invent facts not present in the original. Preserve scene 'type', 'visual', and 'camera' fields exactly. You may rewrite 'title', 'subtitle', 'text', 'ctaText'. If shortening, you may remove scenes. If lengthening, you may insert new scenes that build on existing themes.`;
  const userMessage = `Original storyboard:\n${JSON.stringify(parsed.data.storyboard, null, 2)}\n\nRewrite directive: ${directive}${instructions ? `\n\nAdditional instructions: ${instructions}` : ""}\n\nReturn JSON: { "scenes": [...] }`;

  const RewriteSchema = z.object({
    scenes: z.array(z.record(z.string(), z.unknown())),
  });

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { data } = await llm.callJson(
      "studio_script_rewrite",
      { useCase: "studio_misc", systemPrompt, userMessage },
      RewriteSchema,
    );

    return c.json(ok({
      mode,
      sceneCount: data.scenes.length,
      storyboard: data,
      projectId,
      userId: user.sub,
    }));
  } catch (err) {
    return aiFailure(c, err, "[script/rewrite] LLM error");
  }
});
