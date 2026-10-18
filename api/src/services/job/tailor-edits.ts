/**
 * Tailor — the pure half of the pipeline: the model's compact EDIT
 * contract, the prompt, applying edits to a résumé (with a content-path
 * anchor per change, so Revert is exact), and validation. No I/O.
 *
 * Shared by POST /api/match/tailor (tailor-handler.ts) and create-from-a-
 * job (services/resume/from-job.ts), which applies the same edit op-set.
 * Extracted from match-handlers.ts (which kept the scoring flows).
 *
 * Facade — the code lives in cohesive sibling modules:
 *   • tailor-edit-contract.ts — wire schemas + lenient ingest
 *   • tailor-validation.ts    — preservation validator
 *   • tailor-prompt.ts        — prompt build + retry strengthening
 *   • tailor-apply.ts         — applyResumeEdits, toJobGaps, honesty guard
 * New code should import from those modules directly.
 */
export {
  TailorChangeSchema,
  type TailorChange,
} from "../../../../shared/resume-tailor.js";
export {
  coerceToString,
  TailorEditSchemaWire,
  type TailorEdit,
  TailorGapWireSchema,
  type TailorGapWire,
  TailorEditResponseSchema,
  type TailorEditResponse,
  TailorEditResponseIngest,
} from "./tailor-edit-contract.js";
export {
  type TailorValidationResult,
  validateTailorOutput,
} from "./tailor-validation.js";
export {
  type TailorPromptInput,
  type TailorPromptOutput,
  buildTailorPrompt,
  strengthenPrompt,
  strengthenEditMatchPrompt,
} from "./tailor-prompt.js";
export {
  applyResumeEdits,
  toJobGaps,
  dropUnsupportedSkills,
} from "./tailor-apply.js";
