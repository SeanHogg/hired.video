/**
 * Who a résumé vision-OCR call is recorded against (#2230).
 *
 * A signed-in (or guest) uploader is billed normally: the call is debited and
 * lands in `ai_usage_records` under `resume_image_ocr`. An anonymous upload
 * (the public tools via `POST /api/resumes/extract-text`) has no user row, so
 * its cost is recorded against the house account as an exempt audit row —
 * spend is visible, nothing is debited. With no house account configured the
 * call simply isn't recorded (the old behaviour).
 */
export interface OcrBillingOpts {
  billedUserId?: string;
  exempt?: true;
}

export function ocrBillingOpts(
  userId: string | null | undefined,
  houseUserId: string | null | undefined,
): OcrBillingOpts {
  if (userId) return {};
  const house = houseUserId?.trim();
  return house ? { billedUserId: house, exempt: true } : {};
}
