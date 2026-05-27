/**
 * Person display normalization — the SINGLE layer between an API
 * person DTO and any consumer that renders a card / chip / mention.
 *
 * Why this module exists (anti-pattern surfaced 2026-05-26):
 *   Pre-this, DiscoverPeopleGrid and PeopleCard each had their own
 *   inline fallback chain for fullName / firstName / lastName / initials.
 *   When one of them was missing the fallback at a render site (e.g.
 *   `{person.fullName}` instead of `{displayFullName}`), the bug surfaced
 *   as blank names on the cards. Per CLEAN / SOLID: display
 *   normalization belongs in one place, not at every consumer site.
 *
 * Contract:
 *   - displayName() always returns a non-empty string. Never returns
 *     "" or null. Worst case it returns `t("labels.user")`.
 *   - initials() always returns 1-2 uppercase chars.
 *   - roleLabel() always returns a non-empty translated string.
 *
 * Consumers MUST route every render through these helpers. Inline
 * fallback chains are the anti-pattern this module exists to prevent.
 */

import type { TFunction } from "i18next";
import { getRoleDisplayLabel } from "./role-utils";

export interface PersonDisplayInput {
  /** Required — DB primary key. Used as last-resort fallback for the
   *  display name when nothing else is set. */
  id: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Some legacy DTOs return `name` instead of `fullName`. Tolerated
   *  here as a defence-in-depth fallback. */
  name?: string | null;
  /** Public handle (`/u/<handle>`). Used as display fallback when no
   *  name is set. */
  externalPublicHandle?: string | null;
  role?: string | number | null;
}

/**
 * Returns a non-empty display name for a person. Fallback order:
 *   1. fullName (trimmed)
 *   2. firstName + " " + lastName (trimmed)
 *   3. name (legacy alias)
 *   4. externalPublicHandle (creator handle)
 *   5. t("labels.user") — translated "User" string
 */
export function getPersonDisplayName(person: PersonDisplayInput, t: TFunction): string {
  const candidate =
    (person.fullName && person.fullName.trim()) ||
    `${(person.firstName ?? "").trim()} ${(person.lastName ?? "").trim()}`.trim() ||
    (person.name && person.name.trim()) ||
    (person.externalPublicHandle && person.externalPublicHandle.trim());
  if (candidate) return candidate;
  return t("labels.user", { defaultValue: "User" });
}

/**
 * Returns 1-2 uppercase initials derived from the display name.
 * Always non-empty.
 */
export function getPersonInitials(person: PersonDisplayInput, t: TFunction): string {
  const name = getPersonDisplayName(person, t);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

/**
 * Returns the translated role label for display. Routes through
 * role-utils' canonical map so adding a new role only updates one
 * place; this wrapper applies i18n on top.
 */
export function getPersonRoleLabel(role: string | number | null | undefined, t: TFunction): string {
  const englishLabel = getRoleDisplayLabel(role);
  // Allow per-locale overrides via i18n keys like `roles.jobSeeker`;
  // fall through to the English label when the key isn't set.
  const i18nKey = `roles.${englishLabel.replace(/\s+/g, "").replace(/^./, (c) => c.toLowerCase())}`;
  return t(i18nKey, { defaultValue: englishLabel });
}
