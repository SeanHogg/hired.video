/**
 * Live-linked résumé references (#2258): when an owner edits a saved
 * reference contact, every résumé item linked to it (`references[].contactId`)
 * shows the new name + role line. One UPDATE statement for all of the
 * owner's résumés that link it — a single subrequest, no per-row round trips
 * (Workers Free) — which rewrites only the linked items, in place and in
 * order. A deleted contact is never swept: its items keep their snapshot.
 *
 * The display text comes from the same helper the importer uses
 * (shared/resume-references.ts), so a refreshed item reads exactly like a
 * freshly imported one.
 */
import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../../db/index.js";
import {
  referenceDisplayText,
  type ReferenceContactLike,
} from "../../../../shared/resume-references.js";
import { logger } from "../../lib/logger.js";

const { resumeInformation } = schema;

/** The SQL that refreshes `contact`'s linked items on `ownerUserId`'s résumés.
 *  Exported so its shape is unit-tested without a database.
 *
 *  `previous` is the contact as it was before this edit. A linked item that
 *  still shows exactly that text is refreshed; one the owner hand-edited on
 *  the résumé (its text no longer matches) keeps the edit and is UNLINKED
 *  (`contactId` dropped), so a later contact edit never overwrites it. */
export function buildLinkedReferenceUpdate(
  db: Db,
  ownerUserId: string,
  contact: ReferenceContactLike,
  previous: ReferenceContactLike,
  now: Date,
) {
  const patch = JSON.stringify({ name: contact.name, reference: referenceDisplayText(contact) });
  const linked = JSON.stringify([{ contactId: contact.id }]);
  const refs = sql`${resumeInformation.content}->'references'`;
  const untouched = sql`coalesce(t.elem->>'name', '') = ${previous.name} AND coalesce(t.elem->>'reference', '') = ${referenceDisplayText(previous)}`;
  const content = sql`jsonb_set(
    ${resumeInformation.content},
    '{references}',
    (SELECT COALESCE(jsonb_agg(CASE
        WHEN t.elem->>'contactId' = ${contact.id} AND ${untouched} THEN t.elem || ${patch}::jsonb
        WHEN t.elem->>'contactId' = ${contact.id} THEN t.elem - 'contactId'
        ELSE t.elem END ORDER BY t.ord), '[]'::jsonb)
       FROM jsonb_array_elements(${refs}) WITH ORDINALITY AS t(elem, ord))
  )`;
  return db
    .update(resumeInformation)
    .set({ content, updatedAt: now })
    .where(
      and(
        eq(resumeInformation.userId, ownerUserId),
        sql`jsonb_typeof(${refs}) = 'array'`,
        sql`${refs} @> ${linked}::jsonb`,
      ),
    )
    .returning({ id: resumeInformation.id });
}

/** Refresh every résumé item linked to `contact`. Resolves with how many
 *  résumés changed; never throws (a failed sweep leaves the snapshots). */
export async function syncLinkedReferences(
  db: Db,
  ownerUserId: string,
  contact: ReferenceContactLike,
  previous: ReferenceContactLike,
  now: Date = new Date(),
): Promise<number> {
  try {
    const rows = await buildLinkedReferenceUpdate(db, ownerUserId, contact, previous, now);
    return rows.length;
  } catch (err) {
    logger.error("[references] linked-reference sync failed", err);
    return 0;
  }
}
