/**
 * Live-linked résumé references (#2258). A résumé's `references[]` item that
 * was pulled from a saved reference contact (/references) keeps the
 * contact's id (`contactId`) next to its display text. When the owner edits
 * the contact, every linked item is refreshed from it — edit once, updated
 * on every résumé; when the contact is deleted the item keeps its last
 * snapshot, so a résumé never loses a reference it shows.
 *
 * Pure: the importer (section-importers.tsx) and the server sweep
 * (services/resume/linked-references.ts) share these.
 */
import type { Reference } from "./resume.js";

/** The contact fields a reference item is made from. */
export interface ReferenceContactLike {
  id: string;
  name: string;
  title?: string | null;
  company?: string | null;
  relationship?: string | null;
}

/** "VP Engineering, Acme · Former manager" — a contact's role context as
 *  the résumé reference line. */
export function referenceDisplayText(c: ReferenceContactLike): string {
  const head = [c.title, c.company].map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
  return [head, (c.relationship ?? "").trim()].filter(Boolean).join(" · ");
}

/** A new résumé reference item linked to `contact`. */
export function referenceFromContact(contact: ReferenceContactLike, id: string): Reference {
  return { id, contactId: contact.id, name: contact.name, reference: referenceDisplayText(contact) };
}
