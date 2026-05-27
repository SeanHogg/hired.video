/**
 * Per-audience content fetch — hits /api/search/public with the
 * `audience` filter per kind so the Resource Map on a /for/[audience]
 * page can render real DB data instead of static placeholders.
 *
 * One thin helper per kind keeps the call surface predictable: each
 * returns an array of items already shaped for the card-factory.
 *
 * Categories `templates`, `articles`, `jobs`, `media`, `events` all
 * understand `audience` after #1629 wired it through.
 * Learning paths come from /api/courses/public (audience filter pending
 * once the courses route adopts content_audiences in a follow-up pass).
 */
import { apiClient } from "@/lib/api-client";

export interface AudienceContentItem {
  id: string;
  type: string;
  title: string;
  summary?: string;
  description?: string;
  avatar?: string;
  href?: string;
  createdAt?: string;
  [key: string]: unknown;
}

const KIND_TO_CATEGORY: Record<string, string> = {
  job: "jobs",
  resume: "resumes",
  video: "media",
  service: "services",
  article: "articles",
  voice: "voices",
  template: "templates",
  user_profile: "people",
  company: "companies",
  event: "events",
};

/** Fetch up to `limit` items of a single ContentLocationKind tagged with
 *  the given audience key. Returns [] (not throws) on transport failure
 *  so a Resource Map bucket gracefully hides instead of breaking the
 *  whole page. */
export async function fetchAudienceContent(
  kind: string,
  audienceKey: string,
  limit = 6,
): Promise<AudienceContentItem[]> {
  const category = KIND_TO_CATEGORY[kind];
  if (!category) return [];
  try {
    const url = `/api/search/public?category=${encodeURIComponent(category)}&audience=${encodeURIComponent(audienceKey)}&limit=${limit}`;
    const res = await apiClient.get<{ items?: AudienceContentItem[] }>(
      url,
      undefined,
      { suppressErrorEvent: true },
    );
    const items = (res.data?.items ?? []) as AudienceContentItem[];
    return items.filter((item) => normaliseType(item.type) === kind).slice(0, limit);
  } catch {
    return [];
  }
}

/** Search-route returns "media" for video kind, "people" for user_profile,
 *  etc. — normalize back to the ContentLocationKind discriminator the
 *  audience registry uses, so per-kind filtering in Resource Map sees a
 *  single vocabulary. */
function normaliseType(type: string | undefined): string {
  if (!type) return "";
  if (type === "media") return "video";
  if (type === "people") return "user_profile";
  return type;
}
