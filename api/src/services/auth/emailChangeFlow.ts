/**
 * HTTP-facing use cases over the two-confirmation email-change flow in
 * ./emailChange.ts (email only mutates once BOTH inboxes confirm):
 *   • requestEmailChangeForUser — POST /api/auth/email-change/request
 *   • confirmEmailChangeStep    — GET  /api/auth/email-change/confirm-{current,new}
 */

import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findUserContactById } from "../../repositories/authFlowRepository.js";
import { requestEmailChange, confirmCurrent, confirmNew } from "./emailChange.js";

/** Sends BOTH confirmation emails. `email_in_use` resolves like success so
 *  the endpoint can't be used to probe which emails are registered. */
export async function requestEmailChangeForUser(userId: string, newEmail: string): Promise<void> {
  const db = getDb();
  const user = await findUserContactById(db, userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");

  const result = await requestEmailChange({
    db,
    userId,
    currentEmail: user.email,
    currentName: user.name,
    newEmail,
  });
  if (result.ok === false && result.reason === "same_email") {
    throw new DomainError(400, "VALIDATION_ERROR", "New email is the same as current email");
  }
}

export async function confirmEmailChangeStep(
  step: "current" | "new",
  token: string,
): Promise<{ finalized: boolean; newEmail: string }> {
  const db = getDb();
  const result = step === "current" ? await confirmCurrent(db, token) : await confirmNew(db, token);
  if (result.ok === false) {
    throw new DomainError(400, "INVALID_TOKEN", `Token ${result.reason}`);
  }
  return { finalized: result.finalized, newEmail: result.newEmail };
}
