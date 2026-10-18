/**
 * Password policy for /api/passwordmanagement: strength evaluation, recent-
 * reuse check against `password_history`, and the 90-day expiry window.
 * Policy constants must match the frontend and email copy.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { AuthTokensRepository } from "../../repositories/authTokensRepository.js";
import { findPasswordAgeById } from "../../repositories/authFlowRepository.js";
import { verifyPassword } from "./password.js";

const PASSWORD_EXPIRY_DAYS = 90;
/** How many previous passwords a new one may not repeat. */
const PASSWORD_HISTORY_DEPTH = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluatePassword(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[^A-Za-z0-9]/.test(password);
  const isNotCommon = !/^(password|123456|qwerty|admin)$/i.test(password.trim());

  const checks = [hasMinLength, hasUppercase, hasLowercase, hasNumbers, hasSpecialChars, isNotCommon];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const isValid = checks.every(Boolean);

  const requirements = [
    "At least 8 characters",
    "At least one uppercase letter",
    "At least one lowercase letter",
    "At least one number",
    "At least one special character",
    "Not a common password",
  ];

  const suggestions: string[] = [];
  if (!hasMinLength) suggestions.push("Use at least 8 characters");
  if (!hasUppercase) suggestions.push("Add an uppercase letter");
  if (!hasLowercase) suggestions.push("Add a lowercase letter");
  if (!hasNumbers) suggestions.push("Add a number");
  if (!hasSpecialChars) suggestions.push("Add a special character");
  if (!isNotCommon) suggestions.push("Avoid common passwords");

  return {
    isValid,
    score,
    requirements,
    suggestions,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumbers,
    hasSpecialChars,
    isNotCommon,
  };
}

/** True when `candidate` matches one of the user's recent password hashes. */
export async function isPasswordRecentlyUsed(userId: string, candidate: string): Promise<boolean> {
  const hashes = await new AuthTokensRepository(getDb()).findRecentPasswordHashes(userId, PASSWORD_HISTORY_DEPTH);
  for (const hash of hashes) {
    try {
      if (await verifyPassword(candidate, hash)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export interface PasswordExpiry {
  isExpired: boolean;
  daysUntilExpiry: number;
  expiredAt: string | undefined;
  expiresAt: string;
  passwordChangedAt: string;
}

/** Expiry status of the user's password — 404 when the user is gone. */
export async function getPasswordExpiry(userId: string): Promise<PasswordExpiry> {
  const user = await findPasswordAgeById(getDb(), userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  const baseline = user.passwordChangedAt ?? user.createdAt;
  const expiresAt = new Date(baseline.getTime() + PASSWORD_EXPIRY_DAYS * DAY_MS);
  const now = new Date();
  const isExpired = now > expiresAt;
  const daysUntilExpiry = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
  return {
    isExpired,
    daysUntilExpiry,
    expiredAt: isExpired ? expiresAt.toISOString() : undefined,
    expiresAt: expiresAt.toISOString(),
    passwordChangedAt: baseline.toISOString(),
  };
}
