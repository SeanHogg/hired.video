/**
 * Failure mapping shared by the studio LLM scaffolders (generate-comic,
 * generate-from-page): an LLM dispatch failure becomes the typed AI_*
 * envelope (correlationId + upgrade banner on plan exhaustion); anything
 * else keeps the 500 GENERATION_FAILED shape.
 */
import { DomainError } from "../../domains/errors.js";
import { buildAIErrorEnvelope } from "../adapters/llm-error.js";

export function toGenerationDomainError(err: unknown, logTag: string, fallbackMessage: string): DomainError {
  const envelope = buildAIErrorEnvelope(err);
  if (envelope) {
    return new DomainError(envelope.status, envelope.code, envelope.message, envelope.payload);
  }
  console.error(`${logTag} scaffolder failed:`, err);
  return new DomainError(500, "GENERATION_FAILED", err instanceof Error ? err.message : fallbackMessage);
}
