/**
 * Public channel (`/u/:handle`) + the owner's channel self-management behind
 * routes/channels.ts. Every "is this user a creator" decision goes through
 * the profile-mode resolver; YouTube ingests through youtube-ingest.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { listChannelNativeVideos } from "../../repositories/studioCatalogRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { getProfilePitch } from "../pitch/pitchService.js";
import { findUserByHandle, resolveProfileMode, type ProfileModeResolution, type ProfileModeSetting } from "./profile-mode.js";
import { deleteIngest, ingestYoutubeUrl, listIngests, setIngestHidden } from "./youtube-ingest.js";

/** The public channel payload; null when no user has that handle. */
export async function getPublicChannel(handle: string) {
  const db = getDb();
  const user = await findUserByHandle(db, handle);
  if (!user) return null;

  // The current video pitch (#2133) rides the same parallel fan-out: null
  // when absent or when the owner hid the "videoResume" section — the same
  // rule /people/:id applies.
  const [resolution, youtubeIngests, nativeVideos, pitch] = await Promise.all([
    resolveProfileMode(db, user),
    listIngests(db, user.id),
    listChannelNativeVideos(db, user.id),
    getProfilePitch({ id: user.id, role: user.role ?? null }),
  ]);

  return {
    user: {
      id: user.id,
      handle: user.externalPublicHandle,
      name: user.name,
    },
    mode: resolution.mode,
    modeSetting: resolution.setting,
    modeAuto: resolution.auto,
    signals: resolution.signals,
    nativeVideos,
    youtubeIngests,
    pitch,
  };
}

export function listMyIngests(userId: string) {
  return listIngests(getDb(), userId, { includeHidden: true });
}

/** Ingest a pasted YouTube URL; any failure is a 400 INGEST_FAILED. */
export async function ingestMyYoutubeUrl(userId: string, url: string) {
  try {
    return await ingestYoutubeUrl(getDb(), userId, url);
  } catch (err) {
    throw new DomainError(400, "INGEST_FAILED", err instanceof Error ? err.message : "Ingest failed");
  }
}

export function setMyIngestHidden(userId: string, ingestId: string, hidden: boolean): Promise<void> {
  return setIngestHidden(getDb(), ingestId, userId, hidden);
}

export function deleteMyIngest(userId: string, ingestId: string): Promise<void> {
  return deleteIngest(getDb(), ingestId, userId);
}

/** Set my profile_mode, then re-resolve so the caller sees the effective mode. */
export async function setMyProfileMode(userId: string, profileMode: ProfileModeSetting): Promise<ProfileModeResolution> {
  const db = getDb();
  const refreshed = await new UsersRepository(db).updateById(userId, { profileMode });
  if (!refreshed) throw new DomainError(404, "NOT_FOUND", "User vanished");
  return resolveProfileMode(db, refreshed);
}
