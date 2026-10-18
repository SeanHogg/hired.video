/**
 * ListEntitiesRepository — the polymorphic side of `list_items`: does the
 * referenced entity exist, and the per-type joins that hydrate a list's items
 * from their owning tables (courses, voice clones).
 *
 * `list_items.entity_id` is intentionally NOT a foreign key, so every write
 * validates the entity through `listEntityExists` first. Adding a list item
 * entity type = add an entry to ENTITY_EXISTS (typed as an exhaustive Record
 * over ListItemEntityType, so the compiler flags a missing one).
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { ListItemEntityType } from "../db/schema/lists.js";

const {
  listItems,
  users,
  jobItems,
  resumeInformation,
  companyProfiles,
  jobPipelineEntries,
  courses,
  studioVoiceClones,
  userProfiles,
  talentPoolCandidates,
} = schema;

function present(rows: unknown[]): boolean {
  return rows.length > 0;
}

const ENTITY_EXISTS: Record<ListItemEntityType, (id: string) => Promise<boolean>> = {
  person: async (id) =>
    present(await getDb().select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)),
  job: async (id) =>
    present(await getDb().select({ id: jobItems.id }).from(jobItems).where(eq(jobItems.id, id)).limit(1)),
  resume: async (id) =>
    present(
      await getDb()
        .select({ id: resumeInformation.id })
        .from(resumeInformation)
        .where(eq(resumeInformation.id, id))
        .limit(1),
    ),
  company: async (id) =>
    present(
      await getDb().select({ id: companyProfiles.id }).from(companyProfiles).where(eq(companyProfiles.id, id)).limit(1),
    ),
  pipeline_entry: async (id) =>
    present(
      await getDb()
        .select({ id: jobPipelineEntries.id })
        .from(jobPipelineEntries)
        .where(eq(jobPipelineEntries.id, id))
        .limit(1),
    ),
  course: async (id) =>
    present(await getDb().select({ id: courses.id }).from(courses).where(eq(courses.id, id)).limit(1)),
  voice_clone: async (id) =>
    present(
      await getDb()
        .select({ id: studioVoiceClones.id })
        .from(studioVoiceClones)
        .where(eq(studioVoiceClones.id, id))
        .limit(1),
    ),
  talent_pool_candidate: async (id) =>
    present(
      await getDb()
        .select({ id: talentPoolCandidates.id })
        .from(talentPoolCandidates)
        .where(eq(talentPoolCandidates.id, id))
        .limit(1),
    ),
};

/** Whether the polymorphic target of a list item exists in its own table. */
export function listEntityExists(entityType: ListItemEntityType, entityId: string): Promise<boolean> {
  return ENTITY_EXISTS[entityType](entityId);
}

/** Courses in a list joined to their author, newest-added first. */
export async function findCourseItemsWithAuthors(listId: string) {
  return getDb()
    .select({
      course: courses,
      author: { id: users.id, name: users.name },
      authorProfile: {
        avatarUrl: userProfiles.avatarUrl,
        customUrlSlug: userProfiles.customUrlSlug,
      },
    })
    .from(listItems)
    .innerJoin(courses, eq(courses.id, listItems.entityId))
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, "course")))
    .orderBy(desc(listItems.addedAt));
}

/** Voice clones in a list, newest-added first. */
export async function findVoiceCloneItems(listId: string) {
  return getDb()
    .select({ clone: studioVoiceClones, addedAt: listItems.addedAt })
    .from(listItems)
    .innerJoin(studioVoiceClones, eq(studioVoiceClones.id, listItems.entityId))
    .where(and(eq(listItems.listId, listId), eq(listItems.entityType, "voice_clone")))
    .orderBy(desc(listItems.addedAt));
}
