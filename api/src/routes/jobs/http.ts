/**
 * HTTP adapter helpers shared by the /api/jobs sub-routers.
 */
import type { AppContext } from "../../types/index.js";
import { isSuperAdmin } from "../../middleware/superAdmin.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMClient } from "../../services/adapters/llm-client.js";

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
