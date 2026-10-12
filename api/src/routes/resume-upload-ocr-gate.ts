/**
 * The `resume_parse` gate + meter for vision OCR on résumé uploads (#2390).
 *
 * Every route that reads uploaded résumé files through the shared intake
 * (services/resume/uploadIntake) may hand images to `ocrResumeImage`, which
 * spends vision-model tokens. That spend counts against the `resume_parse`
 * entitlement (the same budget /parse charges), so each such route asks this
 * ONE helper first:
 *
 *   const ocr = await gateUploadOcr(c, files, "merge_from_file");
 *   if (ocr.blocked) return ocr.blocked;          // 402 ENTITLEMENT_EXCEEDED
 *   … extract / OCR / parse …
 *   ocr.meter();                                  // only after a success
 *
 * Uploads that need no OCR (PDF/DOCX/TXT/JSON) pass without a gate read and
 * `meter()` is a no-op — a plain document read is free. /parse gates and
 * meters every parse itself, so it does not use this helper.
 */
import type { Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { servicesProcessor, type ServicesProcessor } from "../domains/services-processing/index.js";
import { uploadsNeedOcr } from "../services/resume/uploadText.js";

/** `blocked` is the 402 to return (null = go ahead); `meter()` records one
 *  `resume_parse` event when OCR ran (no-op otherwise, at most once). One
 *  flat shape rather than a union: the API compiles with `strict: false`,
 *  where a null discriminant does not narrow. */
export interface UploadOcrGate {
  blocked: Response | null;
  needsOcr: boolean;
  meter: () => void;
}

const NOOP = (): void => {};

/** The two processor calls the gate uses; tests inject a recording fake. */
export type UploadOcrProcessor = Pick<ServicesProcessor, "enforce" | "meterEvent">;

export async function gateUploadOcr(
  c: Context<AppEnv>,
  files: readonly File[],
  source: string,
  processor: UploadOcrProcessor = servicesProcessor,
): Promise<UploadOcrGate> {
  if (!uploadsNeedOcr(files)) return { blocked: null, needsOcr: false, meter: NOOP };
  const blocked = await processor.enforce(c, "resume_parse");
  if (blocked) return { blocked, needsOcr: true, meter: NOOP };
  let metered = false;
  return {
    blocked: null,
    needsOcr: true,
    meter: () => {
      if (metered) return;
      metered = true;
      processor.meterEvent(c, "resume_parse", { source });
    },
  };
}
