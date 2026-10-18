/**
 * GamePlayInvitesRepository — friend-invite links for a game project
 * (gap #1637). Thin wrapper over shareLinksRepository (`share_links`,
 * subject_type 'game_play', subject = the studio project) keeping the legacy
 * game_play_invites row shape the /api/games invite API returns. The
 * invite's state (revoked / expired / max_uses vs joined_count) lives on the
 * same row.
 */
import * as shareLinks from "./shareLinksRepository.js";
import type { ShareLinkRow } from "./shareLinksRepository.js";

const KIND = "game_play";

export interface GamePlayInviteRow {
  id: string;
  projectId: string;
  createdBy: string | null;
  token: string;
  label: string | null;
  restrictToUserId: string | null;
  maxUses: number | null;
  joinedCount: number;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

function toInvite(row: ShareLinkRow): GamePlayInviteRow {
  return {
    id: row.id,
    projectId: row.subjectId,
    createdBy: row.createdBy,
    token: row.shareToken,
    label: row.label,
    restrictToUserId: row.restrictToUserId,
    maxUses: row.maxUses,
    joinedCount: row.joinedCount,
    revokedAt: row.revokedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export async function insertGamePlayInvite(values: {
  projectId: string;
  createdBy: string;
  token: string;
  label: string | null;
  maxUses: number | null;
  restrictToUserId: string | null;
  expiresAt: Date | null;
}): Promise<GamePlayInviteRow> {
  return toInvite(
    await shareLinks.insertShareLink(KIND, {
      subjectId: values.projectId,
      createdBy: values.createdBy,
      shareToken: values.token,
      label: values.label,
      maxUses: values.maxUses,
      restrictToUserId: values.restrictToUserId,
      expiresAt: values.expiresAt,
    }),
  );
}

/** A project's invites, newest first (capped). */
export async function listGamePlayInvites(projectId: string, limit: number): Promise<GamePlayInviteRow[]> {
  return (await shareLinks.listShareLinks(KIND, { subjectId: projectId, limit })).map(toInvite);
}

/** Soft-revoke an invite of `projectId` (no-op when it isn't that project's). */
export async function revokeGamePlayInvite(id: string, projectId: string): Promise<void> {
  await shareLinks.updateShareLink(KIND, id, { revokedAt: new Date() }, { subjectId: projectId });
}

export async function findGamePlayInviteByToken(token: string): Promise<GamePlayInviteRow | null> {
  const row = await shareLinks.findShareLinkByToken(KIND, token);
  return row ? toInvite(row) : null;
}

export async function recordGamePlayInviteJoin(id: string): Promise<void> {
  await shareLinks.incrementShareLinkJoins(id);
}
