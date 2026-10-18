/**
 * HTTP helpers every studio sub-router shares (W2-3a split of
 * routes/studio.ts): the prompt-safety gate for the AI generation routes, and the request's
 * acting user.
 */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { screenPrompt, userBlockMessage } from "../../services/moderation/promptGuard.js";
import { error } from "../../types/index.js";

/**
 * Prompt-safety gate for the AI generation routes (image / inpaint /
 * outpaint / comic / storyboard). Screens the user's free-form prompt
 * fields BEFORE any model fires — fast-fail, no token spend — and is the
 * authoritative block for the Workers-AI image path (which never touches
 * LLMClient) and for routes that catch LLM errors and fall back to a mock.
 * Returns a ready-to-return 422 response on a hit, or null when clean.
 */
export function guardGenerationPrompt(
  c: Context<AppEnv>,
  ...prompts: Array<string | null | undefined>
): Response | null {
  for (const p of prompts) {
    const screen = screenPrompt(p);
    if (!screen.safe) {
      return c.json(
        error("CONTENT_BLOCKED", userBlockMessage(screen.category!), {
          category: screen.category,
        }),
        422,
      );
    }
  }
  return null;
}
