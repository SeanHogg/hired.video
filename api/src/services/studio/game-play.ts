/**
 * 3D world game play use cases behind /api/games (routes/games.ts): the
 * project guard, the owner push (#1656), and the friend-invite share links
 * (#1637: create / list / revoke / resolve / join). Every authoring call
 * funnels through `canActFor` (owner, company member, delegate); unknown and
 * forbidden projects answer the same 404. SQL lives in
 * repositories/studioProjectsRepository.ts and gamePlayInvitesRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectAccess, findProjectAccessWithState } from "../../repositories/studioProjectsRepository.js";
import {
  findGamePlayInviteByToken,
  insertGamePlayInvite,
  listGamePlayInvites,
  recordGamePlayInviteJoin,
  revokeGamePlayInvite,
  type GamePlayInviteRow,
} from "../../repositories/gamePlayInvitesRepository.js";
import { sendPushToUser } from "../push/web-push.js";
import { randomBase64Url } from "../../utils/crypto.js";
import { canActFor } from "./workspace.js";

const projectNotFound = () => new DomainError(404, "NOT_FOUND", "Project not found");

/** Invite tokens are URL-safe: 18 random bytes → 24 base64url chars. Enough
 *  entropy to make guessing impractical; short enough that the share link
 *  fits in a single tap-to-copy line. */
const INVITE_TOKEN_BYTES = 18;

/** The project's game state; 404 when the project does not exist. */
export async function getGameProjectState(projectId: string): Promise<{ id: string; gameState: unknown }> {
  const row = await findProjectAccessWithState(getDb(), projectId, "gameState");
  if (!row) throw projectNotFound();
  return { id: row.id, gameState: row.state };
}

/** 404 unless the actor may act on the project (owner / company / delegate). */
async function assertActableGameProject(actorUserId: string, projectId: string): Promise<void> {
  const row = await findProjectAccess(getDb(), projectId);
  if (!row) throw projectNotFound();
  if (!(await canActFor(actorUserId, row.userId, row.companyId ?? null))) throw projectNotFound();
}

export interface GameOwnerEvent {
  event: "peer_joined" | "challenge_awarded";
  peerName?: string;
  /** challenge_awarded only. */
  pointsAwarded?: number;
}

/** Best-effort PWA push to the project owner for a game event; 404 when the
 *  project does not exist. Delivery failures are swallowed. */
export async function notifyGameOwner(projectId: string, input: GameOwnerEvent): Promise<void> {
  const row = await findProjectAccess(getDb(), projectId);
  if (!row) throw projectNotFound();

  const peer = input.peerName?.trim() || "Someone";
  const payload =
    input.event === "peer_joined"
      ? {
          title: `${peer} joined your world`,
          body: "Tap to jump back in.",
          url: `/studio/${projectId}/play`,
        }
      : {
          title: "Challenge completed",
          body: input.pointsAwarded
            ? `${peer} earned ${input.pointsAwarded} points in your world.`
            : `${peer} completed a challenge in your world.`,
          url: `/studio/${projectId}/play`,
        };

  await sendPushToUser(row.userId, payload).catch(() => undefined);
}

export interface CreateGameInviteInput {
  label?: string;
  expiresInHours?: number;
  maxUses?: number;
  restrictToUserId?: string;
}

export async function createGameInvite(
  actorUserId: string,
  projectId: string,
  input: CreateGameInviteInput,
): Promise<GamePlayInviteRow> {
  await assertActableGameProject(actorUserId, projectId);
  const expiresAt = input.expiresInHours
    ? new Date(Date.now() + input.expiresInHours * 3600_000)
    : null;
  return insertGamePlayInvite({
    projectId,
    createdBy: actorUserId,
    token: randomBase64Url(INVITE_TOKEN_BYTES),
    label: input.label ?? null,
    maxUses: input.maxUses ?? null,
    restrictToUserId: input.restrictToUserId ?? null,
    expiresAt,
  });
}

export async function listGameInvites(actorUserId: string, projectId: string): Promise<GamePlayInviteRow[]> {
  await assertActableGameProject(actorUserId, projectId);
  return listGamePlayInvites(projectId, 50);
}

export async function revokeGameInvite(actorUserId: string, projectId: string, inviteId: string): Promise<void> {
  await assertActableGameProject(actorUserId, projectId);
  await revokeGamePlayInvite(inviteId, projectId);
}

/** Current status of an invite — single seam so resolve + join can't drift
 *  on what "expired" means. */
function computeInviteStatus(invite: GamePlayInviteRow): "active" | "revoked" | "expired" | "exhausted" {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) return "expired";
  if (invite.maxUses != null && invite.joinedCount >= invite.maxUses) return "exhausted";
  return "active";
}

/** The usable invite behind `token`: 404 when unknown, 410 REVOKED / EXPIRED /
 *  EXHAUSTED when it can no longer be used. */
async function loadActiveInvite(token: string): Promise<GamePlayInviteRow> {
  const invite = await findGamePlayInviteByToken(token);
  if (!invite) throw new DomainError(404, "NOT_FOUND", "Invite not found");
  const status = computeInviteStatus(invite);
  if (status !== "active") throw new DomainError(410, status.toUpperCase(), `Invite is ${status}`);
  return invite;
}

/** Public: resolve a token to the play landing data. */
export async function resolveGameInvite(token: string) {
  const invite = await loadActiveInvite(token);
  // `studio_projects` carries no per-row display name — the invite label is
  // the user-facing title on the play landing.
  const project = await getGameProjectState(invite.projectId);
  return { projectId: project.id, label: invite.label, gameState: project.gameState };
}

/** Public: count a join. An account-bound link only admits that account
 *  (anonymous callers are rejected when `restrictToUserId` is set). */
export async function joinGameInvite(token: string, callerUserId: string | null): Promise<{ projectId: string }> {
  const invite = await loadActiveInvite(token);
  if (invite.restrictToUserId && invite.restrictToUserId !== callerUserId) {
    throw new DomainError(403, "FORBIDDEN", "This invite is bound to a specific account");
  }
  await recordGamePlayInviteJoin(invite.id);
  return { projectId: invite.projectId };
}
