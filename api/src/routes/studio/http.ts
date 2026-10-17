/**
 * HTTP helpers every studio sub-router shares (W2-3a split of
 * routes/studio.ts): the studio envelope (re-exported from
 * services/studio/envelope.ts), the DomainError / WorkspaceForbiddenError → response mapping,
 * the prompt-safety gate for the AI generation routes, and the request's
 * acting user.
 */
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";
import { WorkspaceForbiddenError } from "../../services/studio/workspace.js";
import { screenPrompt, userBlockMessage } from "../../services/moderation/promptGuard.js";

import { fail } from "../../services/studio/envelope.js";

export { ok, fail } from "../../services/studio/envelope.js";

type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503;

/**
 * Map a use-case failure onto the studio envelope: a DomainError keeps its
 * status/code/details, a WorkspaceForbiddenError is the 403 every studio
 * write has always returned. Anything else is a genuine bug — rethrown to
 * the global onError handler.
 */
export function studioErrorResponse(c: Context<AppEnv>, err: unknown): Response {
  if (isDomainError(err)) {
    return c.json(fail(err.code, err.message, err.details), err.status as ErrorStatus);
  }
  if (err instanceof WorkspaceForbiddenError) {
    return c.json(fail("FORBIDDEN", err.message), 403);
  }
  throw err;
}

/** The acting user's id (auth middleware guarantees it on authed routes). */
export function actorId(c: Context<AppEnv>): string | undefined {
  return c.var.user?.sub;
}

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
        fail("CONTENT_BLOCKED", userBlockMessage(screen.category!), {
          category: screen.category,
        }),
        422,
      );
    }
  }
  return null;
}
