/**
 * Self-service account use cases behind `/api/users`: vanity slug
 * (claim + availability check), avatar upload, and account deletion.
 */
import { z } from "zod";
import { DomainError } from "../../domains/errors.js";
import { isReservedVanitySlug } from "../../../../shared/reserved-slugs.js";
import { cdnUrl, r2KeyFromCdnUrl } from "../../utils/cdn.js";
import { deleteUserObjects } from "../storage/delete-user-objects.js";
import { getVideoBucket, putObject } from "../storage/object-store.js";
import { logger } from "../../lib/logger.js";
import {
  deleteUserRow,
  findAvatarUrl,
  findSlugOwnerId,
  upsertAvatarUrl,
  upsertSlug,
} from "../../repositories/usersProfileRepository.js";

export const UpdateSlugSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers and hyphens")
    .refine((slug) => !isReservedVanitySlug(slug), "This URL is reserved"),
});

/** PATCH /slug — claim a custom URL slug (unique across userProfiles). */
export async function updateMySlug(userId: string, slug: string) {
  const ownerId = await findSlugOwnerId(slug);
  if (ownerId && ownerId !== userId) {
    throw new DomainError(409, "CONFLICT", "This slug is already taken");
  }
  await upsertSlug(userId, slug);
  return { slug };
}

/** GET /check-slug/:slug — availability (your own slug counts as available). */
export async function checkSlugAvailability(slug: string, viewerId: string | undefined) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    return { available: false, reason: "Invalid format" };
  }
  if (isReservedVanitySlug(slug)) {
    return { available: false, reason: "Reserved" };
  }
  const ownerId = await findSlugOwnerId(slug);
  return { available: !ownerId || ownerId === viewerId };
}

/** POST /me/avatar — store the (already validated) upload and point the profile at it. */
export async function uploadMyAvatar(args: {
  userId: string;
  fileName: string | undefined;
  bytes: Parameters<typeof putObject>[1];
  contentType: string;
  waitUntil: (p: Promise<unknown>) => void;
}) {
  const { userId, bytes, contentType, waitUntil } = args;
  const ext = args.fileName?.split(".").pop()?.toLowerCase() ?? "jpg";
  const key = `uploads/${userId}/avatars/${crypto.randomUUID()}.${ext}`;

  if (!getVideoBucket()) {
    // No bucket configured (local dev) — return a data URL stub
    const stubUrl = cdnUrl(key);
    await upsertAvatarUrl(userId, stubUrl);
    return { avatarUrl: stubUrl };
  }

  await putObject(key, bytes, contentType);
  const avatarUrl = cdnUrl(key);

  const previousAvatarUrl = await findAvatarUrl(userId);
  await upsertAvatarUrl(userId, avatarUrl);

  // Reclaim the replaced avatar (#733) — only our own uploaded avatar keys,
  // never an OAuth/Gravatar URL. Best-effort: the new avatar is already live.
  const previousKey = r2KeyFromCdnUrl(previousAvatarUrl);
  if (previousKey && previousKey !== key && previousKey.startsWith(`uploads/${userId}/avatars/`)) {
    waitUntil(
      deleteUserObjects(userId, [previousKey]).catch((err) => logger.warn("[avatar] old avatar not reclaimed", err)),
    );
  }

  return { avatarUrl };
}

/** DELETE /account — permanently delete the caller's account. */
export async function deleteMyAccount(userId: string): Promise<null> {
  await deleteUserRow(userId);
  return null;
}
