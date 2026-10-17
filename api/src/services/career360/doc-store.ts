/** Career 360 document persistence on `user_profiles.career_target`. */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { CareerTargetDocSchema, type CareerTargetDoc } from "../../../../shared/career360-types.js";

const { userProfiles } = schema;

export async function loadDoc(userId: string): Promise<CareerTargetDoc | null> {
  const db = getDb();
  const [row] = await db
    .select({ doc: userProfiles.careerTarget })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!row?.doc) return null;
  const parsed = CareerTargetDocSchema.safeParse(row.doc);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function persistDoc(userId: string, doc: CareerTargetDoc): Promise<void> {
  const db = getDb();
  // user_profiles row is created at signup, but if for any reason it
  // isn't there (legacy accounts), upsert lazily so the route stays
  // functional rather than throwing on a missing row.
  const [existing] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  // Drizzle's `$inferInsert` for `user_profiles` resolves down to
  // `{ userId: string }` due to the table's width — same gap that
  // forces `repositories/usersRepository.ts::upsertProfile` to cast
  // its input. Concentrate the workaround in one local helper rather
  // than scattering `as any` through the call sites.
  const patch = asInsertPatch({ careerTarget: doc, updatedAt: new Date() });
  if (existing) {
    await db.update(userProfiles).set(patch).where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ userId, ...patch });
  }
}

function asInsertPatch(
  value: { careerTarget: CareerTargetDoc; updatedAt: Date },
): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}
