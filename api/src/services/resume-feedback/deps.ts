/**
 * Resume-feedback DI seam: the deps port every use case is built from, and
 * its production default. Tests construct their own bundle and pass it into
 * ResumeFeedbackService directly.
 */
import { getDb } from "../../db/index.js";
import {
  ResumeFeedbackRepository,
  type IResumeFeedbackRepository,
} from "../../repositories/resumeFeedbackRepository.js";

export interface ResumeFeedbackServiceDeps {
  repo: IResumeFeedbackRepository;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

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
