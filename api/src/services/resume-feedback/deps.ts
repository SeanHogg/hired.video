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
import { randomBytes } from "../../utils/crypto.js";

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
    randomBytes,
  };
}
