/** The résumé use cases' typed failures — one place for codes + copy. */
import { DomainError } from "../../domains/errors.js";

export function resumeNotFound(message = "Resume not found"): DomainError {
  return new DomainError(404, "NOT_FOUND", message);
}

/** A write whose content failed heal + validate. */
export function invalidResumeContent(issues: Array<{ path: string; message: string }>): DomainError {
  return new DomainError(400, "VALIDATION_ERROR", "Invalid resume content", { issues });
}

export function invalidResumeBody(details?: unknown): DomainError {
  return new DomainError(400, "VALIDATION_ERROR", "Invalid request body", details);
}

export function slugTaken(slug: string): DomainError {
  return new DomainError(409, "SLUG_TAKEN", `The slug "${slug}" is already in use. Please choose a different slug.`);
}
