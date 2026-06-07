/**
 * Resume-feedback service DI wiring. Production default; tests construct their
 * own bundle and pass it into ResumeFeedbackService directly.
 */
import { getDb } from "../../db/index.js";
import { ResumeFeedbackRepository } from "../../repositories/resumeFeedbackRepository.js";
import type { ResumeFeedbackServiceDeps } from "./ResumeFeedbackService.js";

export function defaultResumeFeedbackServiceDeps(): ResumeFeedbackServiceDeps {
  const db = getDb();
  return {
    repo: new ResumeFeedbackRepository(db),
    now: () => new Date(),
    randomBytes: (n: number) => {
      const a = new Uint8Array(n);
      const g = (globalThis as { crypto?: Crypto }).crypto;
      if (!g || typeof g.getRandomValues !== "function") {
        throw new Error("crypto.getRandomValues is unavailable in this runtime");
      }
      g.getRandomValues(a);
      return a;
    },
  };
}
