/**
 * HTTP adapter helpers shared by the /api/jobs sub-routers.
 */
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "../../types/index.js";
import { error } from "../../types/index.js";
import { isDomainError } from "../../domains/errors.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMClient } from "../../services/adapters/llm-client.js";

/** Run a handler body; a thrown DomainError renders as the standard
 *  `error(code, message, details)` envelope with its status. Anything else
 *  propagates to the global error handler. */
export async function withDomainErrors(c: AppContext, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (isDomainError(err)) {
      return c.json(error(err.code, err.message, err.details), err.status as ContentfulStatusCode);
    }
    throw err;
  }
}

/** Viewer context for job DTOs (`viewerCanManage`), or undefined when anonymous. */
export function jobViewerOf(c: AppContext): { userId: string; isSuperAdmin: boolean } | undefined {
  const user = c.var.user;
  return user?.sub
    ? {
        userId: user.sub,
        isSuperAdmin: isSuperAdmin(user),
      }
    : undefined;
}

/** The caller's LLM client, or null when no provider key is configured. */
export function llmFor(c: AppContext): LLMClient | null {
  return hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
}
