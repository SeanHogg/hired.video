/**
 * Video personalization (migration 0503, gap #2350) — the ONE reader/writer
 * of `user_video_personalization`. Reads go through the read-through cache
 * (per user) and every save drops that user's entry.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { userVideoPersonalization } from "../../db/schema/videoPersonalization.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { isVideoThemeId } from "../../../../shared/video-themes.js";
import {
  DEFAULT_VIDEO_PERSONALIZATION,
  type MonthDay,
  type VideoPersonalization,
} from "../../../../shared/video-personalization.js";

type Row = typeof userVideoPersonalization.$inferSelect;

const TTL_SECONDS = 3600;
const keyOf = (userId: string) => `video-personalization:v1:${userId}`;

function monthDay(month: number | null, day: number | null): MonthDay | null {
  return month && day ? { month, day } : null;
}

function fromRow(row: Row): VideoPersonalization {
  return {
    ownWords: row.ownWords,
    interests: row.interests,
    birthday: monthDay(row.birthdayMonth, row.birthdayDay),
    wedding: monthDay(row.weddingMonth, row.weddingDay),
    inMemory: monthDay(row.memoryMonth, row.memoryDay),
    isParent: row.isParent,
    useWorkAnniversary: row.useWorkAnniversary,
    useGraduation: row.useGraduation,
    theme:
      row.themeMode === "fixed" && isVideoThemeId(row.fixedThemeId)
        ? { mode: "fixed", themeId: row.fixedThemeId }
        : { mode: "byDate" },
  };
}

function toColumns(p: VideoPersonalization) {
  return {
    ownWords: p.ownWords,
    interests: [...p.interests],
    birthdayMonth: p.birthday?.month ?? null,
    birthdayDay: p.birthday?.day ?? null,
    weddingMonth: p.wedding?.month ?? null,
    weddingDay: p.wedding?.day ?? null,
    memoryMonth: p.inMemory?.month ?? null,
    memoryDay: p.inMemory?.day ?? null,
    isParent: p.isParent,
    useWorkAnniversary: p.useWorkAnniversary,
    useGraduation: p.useGraduation,
    themeMode: p.theme.mode,
    fixedThemeId: p.theme.mode === "fixed" ? p.theme.themeId : null,
    updatedAt: new Date(),
  };
}

/** The person's personalization, or the defaults when they haven't set any. */
export function getVideoPersonalization(userId: string, db: Db = getDb()): Promise<VideoPersonalization> {
  return getOrSetCached({
    key: keyOf(userId),
    ttlSeconds: TTL_SECONDS,
    loader: async () => {
      const [row] = await db.select().from(userVideoPersonalization).where(eq(userVideoPersonalization.userId, userId)).limit(1);
      return row ? fromRow(row) : DEFAULT_VIDEO_PERSONALIZATION;
    },
  });
}

export async function saveVideoPersonalization(
  userId: string,
  input: VideoPersonalization,
  db: Db = getDb(),
): Promise<VideoPersonalization> {
  const cols = toColumns(input);
  const [row] = await db
    .insert(userVideoPersonalization)
    .values({ userId, ...cols })
    .onConflictDoUpdate({ target: userVideoPersonalization.userId, set: cols })
    .returning();
  invalidateCachedKey(keyOf(userId));
  return fromRow(row);
}

/** GDPR erasure: account deletion anonymizes the users row (the cascade
 *  never fires), so the person's moments are deleted explicitly. */
export async function eraseVideoPersonalization(userId: string, db: Db = getDb()): Promise<void> {
  await db.delete(userVideoPersonalization).where(eq(userVideoPersonalization.userId, userId));
  invalidateCachedKey(keyOf(userId));
}
