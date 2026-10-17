/**
 * Model routing for the LLM port: resolve the ordered fallback chain of
 * inference profiles for a use case, honoring the SA-only override.
 */

import {
  resolveProfileChainForUseCase,
  type InferenceProfile,
  type LLMUseCase,
} from "../providers.js";

/**
 * Resolve the ordered profile chain for a use case, honoring SA
 * override (when present and the caller is SA). SA override collapses
 * the chain to a single profile so SA test failures aren't masked by
 * cross-provider fallback.
 */
export function buildProfileChain(
  sa: boolean,
  useCase: LLMUseCase,
  override:
    | { model?: string; temperature?: number; maxTokens?: number }
    | undefined,
): InferenceProfile[] {
  if (sa && override) {
    const base = resolveProfileChainForUseCase(useCase)[0];
    return [
      {
        model: override.model ?? base.model,
        temperature: override.temperature ?? base.temperature,
        maxTokens: override.maxTokens ?? base.maxTokens,
      },
    ];
  }
  return resolveProfileChainForUseCase(useCase);
}
