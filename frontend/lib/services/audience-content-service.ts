/**
 * Resource-content fetch — hits /api/search/public per ContentLocationKind
 * with EITHER an audience filter (/for/[audience]) or a geo filter
 * (/in/[country]/[state]/[city]) so the Resource Map renders real DB
 * data on both axes from one code path. Per #1629 + #1663.
 *
 * Every searchable category understands `audience` (#1629) and the
 * structured geo params (countryId/stateId/cityId, shipped with
 * content_locations). Learning paths surface under `learning_paths`
 * (#1667).
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
  /** Template items only — what the template makes (studio_templates
   *  media_kind / document_kind); labelled via @shared/template-kinds. */
  mediaKind?: string;
  documentKind?: string | null;
  [key: string]: unknown;
}

/** Filter axis for a Resource Map fetch — exactly one is in play. */
export type ResourceFilter =
  | { audienceKey: string }
  | { geo: { countryId: number; stateId?: string; cityId?: string } };

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
  learning_path: "learning_paths",
};

function buildQuery(kind: string, filter: ResourceFilter, limit: number): string | null {
  const category = KIND_TO_CATEGORY[kind];
  if (!category) return null;
  const params = new URLSearchParams({ category, limit: String(limit) });
  if ("audienceKey" in filter) {
    params.set("audience", filter.audienceKey);
  } else {
    params.set("countryId", String(filter.geo.countryId));
    if (filter.geo.stateId) params.set("stateId", filter.geo.stateId);
    if (filter.geo.cityId) params.set("cityId", filter.geo.cityId);
  }
  return `/api/search/public?${params.toString()}`;
}

/** Fetch up to `limit` items of one ContentLocationKind matching the
 *  filter. Returns [] (not throws) on transport failure so a Resource
 *  Map bucket gracefully hides instead of breaking the whole page. */
export async function fetchResourceContent(
  kind: string,
  filter: ResourceFilter,
  limit = 6,
): Promise<AudienceContentItem[]> {
  const url = buildQuery(kind, filter, limit);
  if (!url) return [];
  try {
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
 *  Resource Map uses, so per-kind filtering sees a single vocabulary. */
function normaliseType(type: string | undefined): string {
  if (!type) return "";
  if (type === "media") return "video";
  if (type === "people") return "user_profile";
  return type;
}
