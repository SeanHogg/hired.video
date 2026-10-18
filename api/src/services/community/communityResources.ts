/**
 * Community resource directory use cases behind routes/community-resources.ts:
 * the approved directory for a geo, submissions (land `pending`), my
 * submissions, and the SuperAdmin moderation queue + approve/reject.
 * Request geo slugs resolve to canonical geo ids (#1833) so directory reads
 * and submissions match on identity; un-resolvable geos keep slug matching.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { resolveGeoSlugs } from "../location/resolve-geo-slugs.js";
import type {
  ResourceAudience,
  ResourceCategory,
  ResourceStatus,
} from "../../../../shared/community-resources.js";

/** Geo slugs are lowercased so /in/us/tx and ?country=US&state=Tx collapse. */
const slug = (s: string) => s.trim().toLowerCase();

export async function listResourceDirectory(q: {
  country: string;
  state?: string;
  city?: string;
  audience?: string;
  category?: string;
}) {
  const db = getDb();
  const { geo } = await resolveGeoSlugs(db, { country: q.country, state: q.state, city: q.city });
  return buildRepos(db).communityResources.listApproved({
    countryCode: slug(q.country),
    stateCode: q.state ? slug(q.state) : null,
    citySlug: q.city ? slug(q.city) : null,
    countryGeoId: geo?.country.id ?? null,
    stateGeoId: geo?.state?.id ?? null,
    cityGeoId: geo?.city?.id ?? null,
    audience: q.audience ?? null,
    category: q.category ?? null,
  });
}

export interface ResourceSubmission {
  title: string;
  description: string;
  url?: string;
  phone?: string;
  category: ResourceCategory;
  audience: ResourceAudience;
  countryCode: string;
  stateCode?: string | null;
  citySlug?: string | null;
}

/** Store a submission as `pending`. Best-effort geo resolution: an
 *  un-resolvable geo stores null ids + keeps slugs. */
export async function submitResource(userId: string, d: ResourceSubmission) {
  const db = getDb();
  const { geo } = await resolveGeoSlugs(db, { country: d.countryCode, state: d.stateCode, city: d.citySlug });
  return buildRepos(db).communityResources.insert({
    submittedBy: userId,
    title: d.title,
    description: d.description,
    url: d.url ? d.url : null,
    phone: d.phone ? d.phone : null,
    category: d.category,
    audience: d.audience,
    countryCode: slug(d.countryCode),
    stateCode: d.stateCode ? slug(d.stateCode) : null,
    citySlug: d.citySlug ? slug(d.citySlug) : null,
    countryGeoId: geo?.country.id ?? null,
    stateGeoId: geo?.state?.id ?? null,
    cityGeoId: geo?.city?.id ?? null,
    status: "pending",
  });
}

export function listMyResources(userId: string) {
  return buildRepos(getDb()).communityResources.listBySubmitter(userId);
}

export function listResourcesByStatus(status: ResourceStatus) {
  return buildRepos(getDb()).communityResources.listByStatus(status);
}

/** Approve / reject; null when the resource is gone. */
export function reviewResource(
  id: string,
  reviewerId: string,
  decision: { status: "approved" | "rejected"; rejectionReason?: string },
) {
  return buildRepos(getDb()).communityResources.review(id, {
    status: decision.status,
    reviewedBy: reviewerId,
    rejectionReason: decision.status === "rejected" ? decision.rejectionReason ?? null : null,
  });
}
