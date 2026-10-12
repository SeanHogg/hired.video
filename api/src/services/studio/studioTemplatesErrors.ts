/** Typed sentinels the studio-template services throw; routes map `code` to
 *  an HTTP status. Own module so the publish and license services share it
 *  without importing each other. */

export type StudioTemplatesErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONSENT_REQUIRED"
  | "NOT_A_CREATOR"
  | "PROGRAM_NOT_ACTIVE"
  | "INVALID_PRICE";

export class StudioTemplatesError extends Error {
  constructor(public readonly code: StudioTemplatesErrorCode, message: string) {
    super(message);
    this.name = "StudioTemplatesError";
  }
}

/** Snapshotted from the existing PLATFORM_FEE_BPS_DEFAULT in
 *  routes/studio-features.ts — duplicated as a constant here so the
 *  services have no inbound dependency on a route module. Keep in sync. */
export const PLATFORM_FEE_BPS_DEFAULT = 500; // 5%
export const MAX_PRICE_CENTS = 1_000_00; // $1,000 hard cap
export const MIN_PRICE_CENTS = 0;
