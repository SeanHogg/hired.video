/**
 * /api/content-audiences — owner-scoped audience tagging for creators
 * (#1644). Distinct from the SuperAdmin batch endpoint in admin.ts: this
 * lets the OWNER of a piece of content set its own audience tags from
 * the authoring form. Ownership is enforced per request.
 *
 *   GET /api/content-audiences/:kind/:entityId  → current tags (owner only)
 *   PUT /api/content-audiences/:kind/:entityId  → replace tag set (owner only)
 *
 * Registered behind the global auth layer, so c.var.user is always set.
 * Self-taggable kinds are those with a single owner column; kinds without
 * one (job, company, user_profile, …) aren't exposed here.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { AudienceService } from "../services/audience/AudienceService.js";
import {
  ContentAudienceSetSchema,
  type ContentAudienceKind,
} from "../../../shared/content-audiences.js";

const { articles, resumeInformation, studioTemplates, courses, videos } = schema;

export const contentAudienceRoutes = new Hono<AppEnv>();

/** Kinds a creator can self-tag, mapped to a resolver that returns the
 *  owning userId for an entity (or null if it doesn't exist). Kinds
 *  absent from this map are not self-taggable via this route. */
const OWNER_RESOLVERS: Partial<
  Record<ContentAudienceKind, (db: any, entityId: string) => Promise<string | null>>
> = {
  article: async (db, id) => {
    const [r] = await db.select({ u: articles.userId }).from(articles).where(eq(articles.id, id)).limit(1);
    return (r as { u: string } | undefined)?.u ?? null;
  },
  resume: async (db, id) => {
    const [r] = await db.select({ u: resumeInformation.userId }).from(resumeInformation).where(eq(resumeInformation.id, id)).limit(1);
    return (r as { u: string } | undefined)?.u ?? null;
  },
  template: async (db, id) => {
    const [r] = await db.select({ u: studioTemplates.creatorId }).from(studioTemplates).where(eq(studioTemplates.id, id)).limit(1);
    return (r as { u: string } | undefined)?.u ?? null;
  },
  learning_path: async (db, id) => {
    const [r] = await db.select({ u: courses.userId }).from(courses).where(eq(courses.id, id)).limit(1);
    return (r as { u: string } | undefined)?.u ?? null;
  },
  video: async (db, id) => {
    const [r] = await db.select({ u: videos.userId }).from(videos).where(eq(videos.id, id)).limit(1);
    return (r as { u: string } | undefined)?.u ?? null;
  },
};

function parseKind(raw: string): ContentAudienceKind | null {
  return (raw in OWNER_RESOLVERS ? (raw as ContentAudienceKind) : null);
}

/** Shared guard: resolve kind, confirm the caller owns the entity.
 *  Returns the entityId on success, or a Response to short-circuit. */
async function requireOwner(c: any): Promise<{ kind: ContentAudienceKind; entityId: string } | Response> {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "auth required"), 401);
  const kind = parseKind(c.req.param("kind"));
  if (!kind) return c.json(error("VALIDATION_ERROR", "kind not self-taggable"), 400);
  const entityId = c.req.param("entityId");
  const resolver = OWNER_RESOLVERS[kind]!;
  const owner = await resolver(getDb(), entityId);
  if (!owner) return c.json(error("NOT_FOUND", "entity not found"), 404);
  if (owner !== userId) return c.json(error("FORBIDDEN", "not your content"), 403);
  return { kind, entityId };
}

contentAudienceRoutes.get("/:kind/:entityId", async (c) => {
  const guard = await requireOwner(c);
  if (guard instanceof Response) return guard;
  const service = new AudienceService({ db: getDb() });
  const rows = await service.resolveForEntity(guard.kind, guard.entityId);
  return c.json(success({ kind: guard.kind, entityId: guard.entityId, audiences: rows }), 200);
});

contentAudienceRoutes.put("/:kind/:entityId", async (c) => {
  const guard = await requireOwner(c);
  if (guard instanceof Response) return guard;
  const body = await c.req.json().catch(() => ({}));
  const parsed = ContentAudienceSetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.message), 400);
  }
  const service = new AudienceService({ db: getDb() });
  await service.saveAudiences(guard.kind, guard.entityId, parsed.data.audiences);
  const rows = await service.resolveForEntity(guard.kind, guard.entityId);
  return c.json(success({ kind: guard.kind, entityId: guard.entityId, audiences: rows }), 200);
});
