/**
 * Community Resources repository — data access for the location-scoped,
 * user-submitted resource directory (see schema/communityResources.ts).
 *
 * One aggregate, flat methods: public directory reads (approved only),
 * the admin moderation queue (by status), "my submissions", and the
 * approve/reject status transition.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { communityResources } from "../db/schema/communityResources.js";
import type {
  CommunityResource,
  NewCommunityResource,
} from "../db/schema/communityResources.js";
import { contentReports } from "../db/schema/reports.js";
import type { ResourceStatus } from "../../../shared/community-resources.js";

type DbLike = any;

/** Approved resources with this many or more active (pending/reviewing)
 *  community flags are auto-hidden from the public directory until a
 *  SuperAdmin resolves them — UGC is lower-trust, so bad links/spam
 *  self-suppress before manual review (gap #1836). */
export const AUTO_HIDE_FLAG_THRESHOLD = 3;

export interface CommunityResourceDirectoryFilter {
  countryCode: string;
  stateCode?: string | null;
  /** When set, narrows to that city's resources PLUS state-wide ones
   *  (city_slug IS NULL). When omitted, returns all rows for the state. */
  citySlug?: string | null;
  audience?: string | null;
  category?: string | null;
}

export interface ReviewResourcePatch {
  status: ResourceStatus;
  reviewedBy: string;
  rejectionReason?: string | null;
}

export interface ICommunityResourcesRepository {
  /** Approved rows for a country (+ optional state / audience / category),
   *  newest first. The public location-page directory query. */
  listApproved(filter: CommunityResourceDirectoryFilter): Promise<CommunityResource[]>;
  /** Admin moderation queue — rows in a given status, newest first. */
  listByStatus(status: ResourceStatus, limit?: number): Promise<CommunityResource[]>;
  /** A user's own submissions across every status. */
  listBySubmitter(userId: string): Promise<CommunityResource[]>;
  findById(id: string): Promise<CommunityResource | null>;
  insert(input: NewCommunityResource): Promise<CommunityResource>;
  /** Approve / reject. Stamps reviewer + timestamp; returns null if gone. */
  review(id: string, patch: ReviewResourcePatch): Promise<CommunityResource | null>;
}

export class CommunityResourcesRepository implements ICommunityResourcesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async listApproved(filter: CommunityResourceDirectoryFilter): Promise<CommunityResource[]> {
    const clauses = [
      eq(communityResources.status, "approved"),
      eq(communityResources.countryCode, filter.countryCode),
    ];
    if (filter.stateCode) clauses.push(eq(communityResources.stateCode, filter.stateCode));
    if (filter.category) clauses.push(eq(communityResources.category, filter.category));
    // City pages show city-specific resources PLUS state-wide ones (no
    // city). State pages (no citySlug) show everything in the state.
    if (filter.citySlug) {
      clauses.push(
        sql`(${communityResources.citySlug} = ${filter.citySlug} OR ${communityResources.citySlug} IS NULL)`,
      );
    }
    // `both` resources surface to either audience, so an audience filter
    // matches the requested audience OR `both`.
    if (filter.audience && filter.audience !== "both") {
      clauses.push(
        sql`(${communityResources.audience} = ${filter.audience} OR ${communityResources.audience} = 'both')`,
      );
    }
    // Auto-hide rows that have piled up active flags (gap #1836).
    clauses.push(
      sql`(SELECT COUNT(*) FROM ${contentReports}
            WHERE ${contentReports.entityType} = 'community_resource'
              AND ${contentReports.entityId} = ${communityResources.id}
              AND ${contentReports.status} IN ('pending', 'reviewing')
          ) < ${AUTO_HIDE_FLAG_THRESHOLD}`,
    );
    return (await this.db
      .select()
      .from(communityResources)
      .where(and(...clauses))
      .orderBy(desc(communityResources.createdAt))) as CommunityResource[];
  }

  async listByStatus(status: ResourceStatus, limit = 200): Promise<CommunityResource[]> {
    return (await this.db
      .select()
      .from(communityResources)
      .where(eq(communityResources.status, status))
      .orderBy(desc(communityResources.createdAt))
      .limit(limit)) as CommunityResource[];
  }

  async listBySubmitter(userId: string): Promise<CommunityResource[]> {
    return (await this.db
      .select()
      .from(communityResources)
      .where(eq(communityResources.submittedBy, userId))
      .orderBy(desc(communityResources.createdAt))) as CommunityResource[];
  }

  async findById(id: string): Promise<CommunityResource | null> {
    const [row] = await this.db
      .select()
      .from(communityResources)
      .where(eq(communityResources.id, id))
      .limit(1);
    return (row as CommunityResource) ?? null;
  }

  async insert(input: NewCommunityResource): Promise<CommunityResource> {
    const [row] = await this.db.insert(communityResources).values(input).returning();
    return row as CommunityResource;
  }

  async review(id: string, patch: ReviewResourcePatch): Promise<CommunityResource | null> {
    const [row] = await this.db
      .update(communityResources)
      .set({
        status: patch.status,
        reviewedBy: patch.reviewedBy,
        reviewedAt: this.now(),
        rejectionReason: patch.rejectionReason ?? null,
        updatedAt: this.now(),
      })
      .where(eq(communityResources.id, id))
      .returning();
    return (row as CommunityResource) ?? null;
  }
}
