/**
 * Request-scoped LLM access for the recruiter use cases: null when no
 * provider key is configured, so callers fall back to heuristics.
 */
import { createLLMClient, hasAnyLLMProviderKey, type LLMClient, type LLMEnv } from "../adapters/llm-client.js";
import type { JwtPayload } from "../../types/index.js";

/** Deferred client constructor (null when no provider key). Lets a caller
 *  build the client inside its own try/catch, per item. */
export function recruiterLlmFactory(env: LLMEnv | undefined, user: JwtPayload | undefined): (() => LLMClient) | null {
  return hasAnyLLMProviderKey(env) ? () => createLLMClient(env, user) : null;
}

/** A ready client, or null when no provider key is configured. */
export function recruiterLlmFor(env: LLMEnv | undefined, user: JwtPayload | undefined): LLMClient | null {
  const make = recruiterLlmFactory(env, user);
  return make ? make() : null;
}
