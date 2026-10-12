/**
 * Native feed cross-post (#2047, PRD §5.7): a scheduled post's `feed`
 * destination lands the video on hired.video's own social feed as an
 * ordinary `feed_posts` row, written through the feed's repository
 * (MediaRepository.insertFeedPost) — the feed card renders it with its
 * existing video media renderer, so there is no second renderer.
 *
 * The row points back at the project (subject `studio_project`) so the
 * drainer can tell an earlier attempt already posted it, and links to the
 * project's public page when it has one.
 */
import { MediaRepository } from "../../repositories/mediaRepository.js";
import { FEED_SUBJECT_STUDIO_PROJECT } from "../../repositories/socialPublishJobRepository.js";
import { getDb, type Db } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { frontendBaseUrl } from "../../utils/public-urls.js";
import { publicVideoPath } from "../../../../shared/public-paths.js";

export interface FeedCrossPostInput {
  userId: string;
  project: { id: string; slug: string | null; isPublic: boolean; title: string };
  video: { r2Key: string; thumbnailUrl: string | null };
  caption: string;
}

/** Hashtags in the caption become feed tags (the feed's own tag shape). */
function hashtagsOf(text: string): Array<{ id: string; tagType: "Hashtag"; tagValue: string; position: number }> {
  const out: Array<{ id: string; tagType: "Hashtag"; tagValue: string; position: number }> = [];
  for (const m of text.matchAll(/#([\p{L}\p{N}_]{1,64})/gu)) {
    out.push({ id: crypto.randomUUID(), tagType: "Hashtag", tagValue: m[1], position: m.index ?? 0 });
  }
  return out;
}

export async function crossPostToFeed(input: FeedCrossPostInput, db: Db = getDb()): Promise<string> {
  const content = input.caption.trim() || input.project.title;
  const publicUrl = input.project.isPublic
    ? `${frontendBaseUrl()}${publicVideoPath(input.project.slug || input.project.id)}`
    : null;
  const row = await new MediaRepository(db).insertFeedPost({
    userId: input.userId,
    content,
    kind: "video",
    privacy: "Public",
    media: [
      {
        id: crypto.randomUUID(),
        mediaType: "Video",
        mediaUrl: cdnUrl(input.video.r2Key),
        thumbnailUrl: input.video.thumbnailUrl ?? undefined,
        altText: input.project.title,
        displayOrder: 0,
      },
    ],
    tags: hashtagsOf(content),
    subjectType: FEED_SUBJECT_STUDIO_PROJECT,
    subjectId: input.project.id,
    ...(publicUrl ? { linkUrl: publicUrl, linkTitle: input.project.title.slice(0, 500) } : {}),
  });
  return row.id;
}
