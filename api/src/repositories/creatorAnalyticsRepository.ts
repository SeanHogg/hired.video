/**
 * CreatorAnalyticsRepository — owner-scoped artifact_views aggregates and
 * batch artifact metadata (title + thumbnail) for the creator rollup.
 *
 * Set-shaped: one GROUP BY carries totals AND the unique-viewer count per
 * artifact, and metadata is fetched with one inArray read per artifact
 * kind instead of one select per artifact.
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import { isArtifactView } from "./artifactViewStreams.js";
import type { ArtifactKind } from "../../../shared/artifact-views.js";

export type DbLike = any;

export interface ArtifactTotalsRow {
  artifactKind: string;
  artifactId: string;
  totalViews: number;
  uniqueViewers: number;
  avgPct: number | null;
  lastViewedAt: Date | string | null;
}

export interface ArtifactMeta {
  title: string;
  thumbnail: string | null;
}

/** Viewer identity for unique-viewer counts: email > viewer_id > ip_hash. */
const viewerKeyExpr = sql`coalesce(${schema.artifactViews.viewerEmail}, ${schema.artifactViews.viewerId}::text, ${schema.artifactViews.ipHash}, 'anonymous')`;

/** Fallback label when an artifact row is missing or its kind is unknown. */
export function fallbackArtifactMeta(kind: string, id: string): ArtifactMeta {
  return { title: `${kind}:${id.slice(0, 6)}`, thumbnail: null };
}

export class CreatorAnalyticsRepository {
  constructor(private readonly db: DbLike) {}

  /** Per-artifact totals for one owner, most-viewed first. */
  async findArtifactTotalsForOwner(ownerUserId: string): Promise<ArtifactTotalsRow[]> {
    const rows = (await this.db
      .select({
        artifactKind: schema.artifactViews.artifactKind,
        artifactId: schema.artifactViews.artifactId,
        totalViews: count(),
        uniqueViewers: sql<number>`count(distinct ${viewerKeyExpr})`,
        avgPct: sql<number>`avg(${schema.artifactViews.percentConsumed})`,
        lastViewedAt: sql<Date | null>`max(${schema.artifactViews.viewedAt})`,
      })
      .from(schema.artifactViews)
      .where(and(eq(schema.artifactViews.ownerUserId, ownerUserId), isArtifactView()))
      .groupBy(schema.artifactViews.artifactKind, schema.artifactViews.artifactId)
      .orderBy(desc(count()))) as Array<Omit<ArtifactTotalsRow, "totalViews" | "uniqueViewers"> & {
      totalViews: number | string;
      uniqueViewers: number | string;
    }>;
    return rows.map((r) => ({
      ...r,
      totalViews: Number(r.totalViews ?? 0),
      uniqueViewers: Number(r.uniqueViewers ?? 0),
    }));
  }

  /** Cross-artifact unique viewers for one owner. */
  async countUniqueViewersForOwner(ownerUserId: string): Promise<number> {
    const [u] = (await this.db
      .select({ n: sql<number>`count(distinct ${viewerKeyExpr})` })
      .from(schema.artifactViews)
      .where(and(eq(schema.artifactViews.ownerUserId, ownerUserId), isArtifactView()))) as Array<{ n: number | string }>;
    return Number(u?.n ?? 0);
  }

  /**
   * Title + thumbnail for many artifacts of ONE kind in a single inArray
   * read. Ids not found get the kind's "Untitled …" default; unknown kinds
   * (or a failed read) get `fallbackArtifactMeta`.
   */
  async findArtifactMeta(kind: ArtifactKind, ids: readonly string[]): Promise<Map<string, ArtifactMeta>> {
    const out = new Map<string, ArtifactMeta>();
    if (ids.length === 0) return out;
    const list = [...ids];
    try {
      switch (kind) {
        case "video": {
          // Studio projects have no thumbnail column — the display title
          // is the saved `name` (see services/studio/project-dto.ts).
          const rows = (await this.db
            .select({
              id: schema.studioProjects.id,
              name: schema.studioProjects.name,
              resumeText: schema.studioProjects.resumeText,
            })
            .from(schema.studioProjects)
            .where(inArray(schema.studioProjects.id, list))) as Array<{
            id: string;
            name: string | null;
            resumeText: string | null;
          }>;
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const id of list) {
            const r = byId.get(id);
            const savedName = r?.name ?? undefined;
            out.set(id, { title: savedName || r?.resumeText?.slice(0, 80) || "Untitled video", thumbnail: null });
          }
          return out;
        }
        case "resume": {
          const rows = (await this.db
            .select({ id: schema.resumeInformation.id, title: schema.resumeInformation.title })
            .from(schema.resumeInformation)
            .where(inArray(schema.resumeInformation.id, list))) as Array<{ id: string; title: string | null }>;
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const id of list) out.set(id, { title: byId.get(id)?.title ?? "Untitled resume", thumbnail: null });
          return out;
        }
        case "company": {
          const rows = (await this.db
            .select({
              id: schema.companyProfiles.id,
              name: schema.companyProfiles.name,
              logoUrl: schema.companyProfiles.logoUrl,
            })
            .from(schema.companyProfiles)
            .where(inArray(schema.companyProfiles.id, list))) as Array<{
            id: string;
            name: string | null;
            logoUrl: string | null;
          }>;
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const id of list) {
            const r = byId.get(id);
            out.set(id, { title: r?.name ?? "Untitled company", thumbnail: r?.logoUrl ?? null });
          }
          return out;
        }
        case "profile": {
          const rows = (await this.db
            .select({ id: schema.users.id, name: schema.users.name })
            .from(schema.users)
            .where(inArray(schema.users.id, list))) as Array<{ id: string; name: string | null }>;
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const id of list) out.set(id, { title: byId.get(id)?.name ?? "Profile", thumbnail: null });
          return out;
        }
        case "job": {
          const rows = (await this.db
            .select({ id: schema.jobItems.id, title: schema.jobItems.title })
            .from(schema.jobItems)
            .where(inArray(schema.jobItems.id, list))) as Array<{ id: string; title: string | null }>;
          const byId = new Map(rows.map((r) => [r.id, r]));
          for (const id of list) out.set(id, { title: byId.get(id)?.title ?? "Untitled job", thumbnail: null });
          return out;
        }
        default:
          for (const id of list) out.set(id, fallbackArtifactMeta(kind, id));
          return out;
      }
    } catch {
      for (const id of list) out.set(id, fallbackArtifactMeta(kind, id));
      return out;
    }
  }
}
