/**
 * Storyboard use cases behind POST /api/studio/storyboard and
 * POST /api/studio/edit-script: generate a VideoScript from a résumé / brief
 * (LLM, or the deterministic `basic` scaffold) with optional brand-kit
 * injection, and surgically edit an existing script. Split out of
 * routes/studio.ts (W2-3a).
 */
import { z } from "zod";
import type { JwtPayload } from "../../types/index.js";
import { getDb } from "../../db/index.js";
import { createLLMClient, type LLMEnv } from "../adapters/llm-client.js";
import { findBrandKitForUser, type BrandKitRow } from "../../repositories/studioBrandKitsRepository.js";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { studioPurposeSchema, VideoScriptSchema, type VideoScript } from "./video-script.js";
import { buildMockAdVideoScript } from "./storyboard-mocks.js";
import {
  buildStudioSystemPrompt,
  defaultStoryboardPrompt,
  detectExplicitSceneCount,
} from "./storyboard-prompts.js";

export const GenerateStoryboardSchema = z.object({
  resumeText: z.string().min(10),
  targetDuration: z.number().min(10).max(120).default(28),
  resumeId: UuidLikeSchema.optional(),
  prompt: z.string().max(500).optional(),
  jobDescription: z.string().max(4000).optional(),
  // No `model` or `temperature` fields on purpose — both are server-owned
  // (sourced from USE_CASE_PROFILES). End users never configure either;
  // SA-only overrides happen via the SuperAdmin admin tooling, not the
  // request body.
  resolution: z.enum(["720p", "1080p"]).optional(),
  motion: z.enum(["minimal", "moderate", "cinematic"]).optional(),
  // Advertising: set purpose to unlock ad-specific scene types + prompts
  purpose: studioPurposeSchema.default("resume"),
  // Brand kit to inject into generated script
  brandKitId: UuidLikeSchema.optional(),
  // CTA for ad use cases
  ctaUrl: z.string().url().optional(),
  ctaText: z.string().max(100).optional(),
});
export type GenerateStoryboardInput = z.infer<typeof GenerateStoryboardSchema>;

export const EditScriptSchema = z.object({
  script: VideoScriptSchema,
  instruction: z.string().min(2).max(500),
  // No `model` field — model selection is server-owned via the
  // studio_edit_script use case. SA overrides happen via admin tooling.
});
export type EditScriptInput = z.infer<typeof EditScriptSchema>;

/** The storyboard LLM call threw or timed out. The route maps `cause` onto
 *  the typed AI_* envelope (`aiFailure`) instead of serving a mock as if
 *  the AI produced it. */
export class StoryboardAiError extends Error {
  constructor(public readonly cause: unknown) {
    super("Storyboard LLM call failed");
    this.name = "StoryboardAiError";
  }
}

// 45s ceiling on the LLM round-trip (#481) — without this the route blocks
// until the client's 360s NetworkError fires while GenerationProgressDialog
// spins with no cancel affordance.
const STORYBOARD_LLM_TIMEOUT_MS = 45_000;

async function callStoryboardLlm(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
  input: GenerateStoryboardInput,
): Promise<VideoScript> {
  const { resumeText, prompt, jobDescription, targetDuration = 28, motion = "moderate", purpose = "resume", ctaUrl, ctaText } = input;
  const llm = createLLMClient(env, user);
  const explicitSceneCount = detectExplicitSceneCount(prompt, targetDuration);
  const systemPrompt = buildStudioSystemPrompt(
    targetDuration, motion, jobDescription, purpose, ctaUrl, ctaText, explicitSceneCount,
  );
  try {
    const callPromise = llm.callJson("studio_storyboard", {
      useCase: "studio_script",
      systemPrompt,
      userMessage: `${prompt || defaultStoryboardPrompt(purpose)}\n\n${resumeText.slice(0, 6000)}`,
    }, VideoScriptSchema);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Storyboard LLM timeout after ${STORYBOARD_LLM_TIMEOUT_MS}ms`)),
        STORYBOARD_LLM_TIMEOUT_MS,
      );
    });
    const { data } = await Promise.race([callPromise, timeoutPromise]);
    return data;
  } catch (err) {
    throw new StoryboardAiError(err);
  }
}

function applyBrandKit(script: VideoScript, brandKit: BrandKitRow | null, purpose: GenerateStoryboardInput["purpose"]): VideoScript {
  if (!brandKit) return { ...script, video: { ...script.video, purpose } };
  return {
    ...script,
    video: {
      ...script.video,
      purpose,
      logoUrl: brandKit.logoUrl ?? script.video.logoUrl,
      theme: {
        ...script.video.theme,
        colorPalette: [brandKit.primaryColor, brandKit.secondaryColor, brandKit.accentColor, "#ffffff"],
        fontFamily: brandKit.fontFamily,
      },
    },
  };
}

/**
 * Generate a storyboard VideoScript. Throws StoryboardAiError when the LLM
 * fails / times out. The script is NOT persisted — the frontend saves it
 * only when the user explicitly clicks Save.
 */
export async function generateStoryboard(
  env: LLMEnv | undefined,
  user: JwtPayload,
  input: GenerateStoryboardInput,
): Promise<VideoScript> {
  const { resumeText, prompt, targetDuration = 28, motion = "moderate", purpose = "resume", brandKitId, ctaUrl, ctaText } = input;

  // Optionally load brand kit to inject colours into generated script
  const brandKit = brandKitId ? await findBrandKitForUser(getDb(), brandKitId, user.sub) : null;

  // "Basic" is a blank-starter template — the user expects a single empty
  // intro scene to land in the editor, NOT a 30-second LLM round-trip +
  // token charge. The scaffold's `basic` branch produces exactly that (one
  // intro scene seeded from the user's brief). Skip the LLM entirely.
  const script = purpose === "basic"
    ? buildMockAdVideoScript((prompt?.trim() || resumeText.trim()).slice(0, 6000), targetDuration, motion, purpose, ctaUrl, ctaText)
    : await callStoryboardLlm(env, user, input);

  return applyBrandKit(script, brandKit, purpose);
}

/**
 * AI surgical edit of an existing VideoScript under a plain-English
 * instruction. Falls back to the unchanged script when the LLM call fails.
 */
export async function editStudioScript(
  env: LLMEnv | undefined,
  user: JwtPayload | null | undefined,
  { script, instruction }: EditScriptInput,
): Promise<VideoScript> {
  const llm = createLLMClient(env, user);
  const systemPrompt = `You are a video script editor. The user has provided a VideoScript JSON and an editing instruction.
Make ONLY the minimal changes needed to fulfil the instruction. Do NOT regenerate the whole script.
Return ONLY valid JSON matching the original VideoScript schema.`;
  try {
    const { data } = await llm.callJson("studio_edit_script", {
      useCase: "studio_edit_script",
      systemPrompt,
      userMessage: `Instruction: ${instruction}\n\nCurrent script:\n${JSON.stringify(script)}`,
    }, VideoScriptSchema);
    return data;
  } catch {
    // Fall through: return the unchanged script when the LLM call fails.
    return script;
  }
}
