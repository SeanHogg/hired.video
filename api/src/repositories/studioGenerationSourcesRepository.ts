/**
 * Source-artefact reads for studio AI generation (POST /api/studio/
 * generate-comic): the user's résumé content, profile basics and service
 * offerings. Every read is scoped to the requesting user.
 */
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { resumeInformation, users, userProfiles, serviceOfferings } = schema;

/** A résumé's JSONB content — the pinned `resumeId` when given, otherwise
 *  the user's first résumé row. Null when none exists. */
export async function findResumeContentForUser(
  db: Db,
  userId: string,
  resumeId: string | undefined,
): Promise<unknown> {
  const where = resumeId
    ? and(eq(resumeInformation.id, resumeId), eq(resumeInformation.userId, userId))
    : eq(resumeInformation.userId, userId);
  const [row] = await db.select({ content: resumeInformation.content }).from(resumeInformation).where(where).limit(1);
  return row?.content ?? null;
}

export interface ProfileSourceRow {
  name: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
}

/** Name + profile basics for the user, or null when the user row is gone. */
export async function findProfileSource(db: Db, userId: string): Promise<ProfileSourceRow | null> {
  const [row] = await db
    .select({
      name: users.name,
      headline: userProfiles.headline,
      summary: userProfiles.summary,
      location: userProfiles.location,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export interface ServiceSourceRow {
  title: string;
  description: string | null;
  category: string | null;
  priceCents: number | null;
}

/** Up to 20 of the user's service offerings. */
export async function listServiceSources(db: Db, userId: string): Promise<ServiceSourceRow[]> {
  return db
    .select({
      title: serviceOfferings.title,
      description: serviceOfferings.description,
      category: serviceOfferings.category,
      priceCents: serviceOfferings.priceCents,
    })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.userId, userId))
    .limit(20);
}
