/**
 * Take-home invite use cases (#1386) behind /api/take-home-invites: the
 * recruiter issues a magic link; the public landing page reads it, stamps
 * `started_at`, and records the submission. Mirrors live-screening invites.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findTakeHomeInviteByToken,
  insertTakeHomeInvite,
  updateTakeHomeInviteByToken,
} from "../../repositories/takeHomeInvitesRepository.js";

const DAY_MS = 86_400_000;

/** Mint a take-home invite token. Uses `crypto.randomUUID` when present,
 *  else a time+random fallback. Always prefixed `th-` and hex-only after
 *  the prefix, fitting the 64-char `invite_token` column. */
export function generateInviteToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `th-${crypto.randomUUID().replace(/-/g, "")}`
    : `th-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Absolute expiry instant for an invite issued `now` that lives
 *  `expiresInDays` days. Pure: same inputs → same Date. */
export function computeExpiresAt(expiresInDays: number, now: number = Date.now()): Date {
  return new Date(now + expiresInDays * DAY_MS);
}

/** An invite is expired once its expiry instant is strictly before `now`. */
export function isInviteExpired(expiresAt: Date, now: number = Date.now()): boolean {
  return expiresAt.getTime() < now;
}

const inviteNotFound = () => new DomainError(404, "NOT_FOUND", "Invite not found");

export async function createTakeHomeInvite(input: {
  stageId: string;
  candidateEmail: string;
  candidateName?: string;
  expiresInDays: number;
}) {
  const inviteToken = generateInviteToken();
  const invite = await insertTakeHomeInvite(getDb(), {
    stageId: input.stageId,
    candidateEmail: input.candidateEmail.toLowerCase(),
    candidateName: input.candidateName ?? null,
    inviteToken,
    status: "pending",
    expiresAt: computeExpiresAt(input.expiresInDays),
  });
  return { invite, magicLink: `/take-home/${inviteToken}` };
}

/** Public preview — 404 unknown, 410 EXPIRED past its expiry. */
export async function getTakeHomeInviteByToken(token: string) {
  const invite = await findTakeHomeInviteByToken(getDb(), token);
  if (!invite) throw inviteNotFound();
  if (isInviteExpired(invite.expiresAt)) {
    throw new DomainError(410, "EXPIRED", "This invite link has expired");
  }
  return { invite };
}

export async function startTakeHomeInvite(token: string) {
  const now = new Date();
  const invite = await updateTakeHomeInviteByToken(getDb(), token, { status: "started", startedAt: now, updatedAt: now });
  if (!invite) throw inviteNotFound();
  return { invite };
}

export async function submitTakeHomeInvite(token: string, submissionId: string | undefined) {
  const now = new Date();
  const invite = await updateTakeHomeInviteByToken(getDb(), token, {
    status: "submitted",
    submittedAt: now,
    submissionId: submissionId ?? null,
    updatedAt: now,
  });
  if (!invite) throw inviteNotFound();
  return { invite };
}
