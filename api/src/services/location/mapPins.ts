/**
 * /map discovery pins (routes/map.ts): upcoming public events and people
 * open to coffee whose origin location falls inside a bounding box. Only pin
 * metadata — the details drawer goes through the owner-only permission seam.
 */
import { getDb } from "../../db/index.js";
import {
  listEventPinsInBox,
  listPeoplePinsInBox,
  type PinBox,
} from "../../repositories/contentLocationsRepository.js";
import { resolveProfileSections } from "../../../../shared/profile-sections.js";

export type { PinBox };

export async function loadMapPins(box: PinBox) {
  const db = getDb();
  const [events, people] = await Promise.all([
    listEventPinsInBox(db, box, new Date()),
    // People: profileSections.openToCoffee is applied post-query (small
    // enough cohort that an in-DB JSON path filter isn't worth the index
    // complexity yet — revisit at 100k+ opted-in users).
    listPeoplePinsInBox(db, box),
  ]);

  const filteredPeople = people
    .map((p) => {
      const resolved = resolveProfileSections(p.sections as any, p.role);
      if (!resolved.openToCoffee) return null;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        avatarUrl: p.avatarUrl,
        headline: p.headline,
        lat: p.lat,
        lng: p.lng,
      };
    })
    .filter(Boolean);

  return {
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      category: e.category,
      eventFormat: e.eventFormat,
      startAt: e.startAt.toISOString(),
      attendeeCount: e.attendeeCount,
      capacity: e.capacity,
      coverImageUrl: e.coverImageUrl,
      lat: e.lat,
      lng: e.lng,
    })),
    people: filteredPeople,
  };
}
