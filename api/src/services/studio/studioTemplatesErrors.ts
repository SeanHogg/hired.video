/** Typed sentinels the studio-template services throw — DomainErrors that
 *  carry their own HTTP status. Own module so the publish and license services share it
 *  without importing each other. */
import { DomainError, statusForErrorCode } from "../../domains/errors.js";

export type StudioTemplatesErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONSENT_REQUIRED"
  | "NOT_A_CREATOR"
  | "PROGRAM_NOT_ACTIVE"
  | "INVALID_PRICE";

export class StudioTemplatesError extends DomainError {
  declare readonly code: StudioTemplatesErrorCode;
  constructor(code: StudioTemplatesErrorCode, message: string) {
    super(statusForErrorCode(code, { NOT_A_CREATOR: 403, PROGRAM_NOT_ACTIVE: 403 }), code, message);
    this.name = "StudioTemplatesError";
  }
}

/** Snapshotted from the existing PLATFORM_FEE_BPS_DEFAULT in
 *  routes/studio-features.ts — duplicated as a constant here so the
 *  services have no inbound dependency on a route module. Keep in sync. */
export const PLATFORM_FEE_BPS_DEFAULT = 500; // 5%
export const MAX_PRICE_CENTS = 1_000_00; // $1,000 hard cap
export const MIN_PRICE_CENTS = 0;
