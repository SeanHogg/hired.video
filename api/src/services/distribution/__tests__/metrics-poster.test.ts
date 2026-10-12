/**
 * #2048 — whose token reads a post's metrics: the recorded poster
 * (published_by), else the creator of the scheduled job that produced the
 * publication, else (only then) the project owner. Pinned on the SQL the
 * due-list and webhook lookups select, built with drizzle's mock driver.
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/metrics-poster.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { schema, type Db } from "../../../db/index.js";
import { studioProjectPublications } from "../../../db/schema/studioPublications.js";
import { studioProjects } from "../../../db/schema/resumes.js";
import { posterUserIdSql } from "../../../repositories/externalPostMetricsRepository.js";

describe("posterUserIdSql", () => {
  const db = drizzle.mock({ schema }) as unknown as Db;
  const { sql } = db
    .select({ poster: posterUserIdSql })
    .from(studioProjectPublications)
    .innerJoin(studioProjects, eq(studioProjects.id, studioProjectPublications.projectId))
    .toSQL();
  const flat = sql.replace(/\s+/g, " ");

  it("prefers the recorded poster, then the job's creator, then the owner — in that order", () => {
    const poster = flat.indexOf('"studio_project_publications"."published_by"');
    const job = flat.indexOf("j.created_by");
    const owner = flat.indexOf('"studio_projects"."user_id"');
    assert.ok(poster > -1 && job > -1 && owner > -1, flat);
    assert.ok(poster < job && job < owner, flat);
    assert.match(flat, /coalesce\(/i);
  });

  it("takes the job that produced THIS publication, latest first", () => {
    assert.match(flat, /FROM "social_publish_jobs" j WHERE j\.publication_id = "studio_project_publications"\."id"/);
    assert.match(flat, /ORDER BY j\.completed_at DESC NULLS LAST LIMIT 1/);
  });
});
