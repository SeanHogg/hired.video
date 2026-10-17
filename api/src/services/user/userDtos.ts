/**
 * Wire DTOs for the `/api/users` endpoints — the People card, the full
 * profile (self + public, privacy-gated) and the connection record. Pure
 * mappers: no I/O. Shapes are frontend contracts (shared/projection.ts
 * USER_LIST_FIELDS documents the card keys).
 */
import { cdnUrl } from "../../utils/cdn.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";
import { resolveProfileSections, type StoredProfileSections } from "../../../../shared/profile-sections.js";
import { splitPersonName } from "../../../../shared/person-name.js";
import type { UserActorRow } from "../../repositories/usersRepository.js";
import type { UserCardRow } from "../../repositories/userCardsRepository.js";
import { toUserActor } from "./userActor.js";

/**
 * Standard public card DTO for user listings.
 *
 * Every endpoint that returns user cards for the frontend should use this
 * so the shape is consistent and avatar URLs are resolved once.
 */
export function toPublicUserCardDto(r: {
  id: string;
  name: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  headline?: string | null;
  summary?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  openToWork?: boolean | null;
  skills?: string[] | null;
  yearsOfExperience?: number | null;
  profileVisibility?: string | null;
  customUrlSlug?: string | null;
  externalPublicHandle?: string | null;
  isCreator?: boolean | null;
  creatorPrograms?: { video: boolean; voice: boolean; services: boolean; articles: boolean; courses: boolean; templates: boolean } | null;
}) {
  // Server-side guarantee: fullName is never empty. Fallback to the
  // public handle (creator brand) if set, else a generic "User <id4>"
  // so the frontend never has to do its own fallback chain (#1657 —
  // the duplicate-fallback anti-pattern that blanked names on the
  // People grid when consumers diverged on which fallback to use).
  const trimmedName = (r.name ?? "").trim();
  const fullName =
    trimmedName
    || (r.externalPublicHandle ?? "").trim()
    || `User ${r.id.slice(0, 4)}`;
  const { firstName, lastName } = splitPersonName(fullName);
  return {
    id: r.id,
    type: "people" as const,
    firstName,
    lastName,
    fullName,
    role: r.role,
    headline: r.headline ?? r.currentRole ?? "",
    summary: r.summary ?? "",
    location: r.location ?? "",
    avatar: r.avatarUrl ? cdnUrl(r.avatarUrl) : null,
    currentRole: r.currentRole ?? "",
    currentCompany: r.currentCompany ?? "",
    openToWork: r.openToWork ?? false,
    skills: r.skills ?? [],
    yearsOfExperience: r.yearsOfExperience ?? null,
    emailConfirmed: r.emailVerified,
    slug: r.customUrlSlug ?? r.id,
    isCreator: r.isCreator === true,
    creatorPrograms: r.creatorPrograms ?? { video: false, voice: false, services: false, articles: false, courses: false, templates: false },
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

export type PublicUserCardDto = ReturnType<typeof toPublicUserCardDto>;

/** Card row (userCardsRepository) → card DTO, folding the creator columns. */
export function cardRowToDto(r: UserCardRow): PublicUserCardDto {
  return toPublicUserCardDto({
    ...r,
    isCreator: r.creatorIsActive === true && r.creatorEndedAt === null,
    creatorPrograms: {
      video: r.creatorVideoActive === true,
      voice: r.creatorVoiceActive === true,
      services: r.creatorServicesActive === true,
      articles: r.creatorArticlesActive === true,
      courses: r.creatorCoursesActive === true,
      templates: r.creatorTemplatesActive === true,
    },
  });
}

export function makeConnectionDto(
  row: {
    id: string; fromUserId: string; toUserId: string; status: string;
    requestMessage: string | null; responseMessage: string | null;
    createdAt: Date | string; updatedAt: Date | string;
  },
  parties?: { fromUser?: UserActorRow | null; toUser?: UserActorRow | null },
) {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status.toLowerCase(),
    // `message` is the canonical name on the frontend ConnectionSchema; keep
    // `requestMessage` for any older consumers still reading it directly.
    message: row.requestMessage ?? "",
    requestMessage: row.requestMessage ?? "",
    responseMessage: row.responseMessage ?? "",
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    fromUser: parties?.fromUser ? toUserActor(parties.fromUser) : undefined,
    toUser: parties?.toUser ? toUserActor(parties.toUser) : undefined,
  };
}

export function toUserProfileDto(
  row: {
    id: string; email: string; name: string; role: string;
    emailVerified: boolean; createdAt: Date | string; updatedAt?: Date | string;
    externalPublicHandle?: string | null;
  },
  profile?: {
    headline?: string | null; summary?: string | null; location?: string | null;
    website?: string | null; phone?: string | null;
    customUrlSlug?: string | null;
    linkedIn?: string | null; github?: string | null; twitter?: string | null;
    currentRole?: string | null; currentCompany?: string | null;
    avatarUrl?: string | null; openToWork?: boolean | null; openToRemote?: boolean | null;
    salaryCurrency?: string | null; salaryExpectation?: number | null;
    yearsOfExperience?: number | null;
    skills?: string[] | null; industries?: string[] | null; preferredRoles?: string[] | null;
    providesServices?: boolean | null;
    profileVisibility?: string | null;
    confidentialMode?: boolean | null;
    confidentialBlocklist?: string[] | null;
    profileSections?: StoredProfileSections | Record<string, boolean> | null;
    updatedAt?: Date | string | null;
  } | null,
  privacyOptions?: {
    isOwner?: boolean;
    privacy?: {
      showEmail?: boolean;
      showPhone?: boolean;
      showLocation?: boolean;
      promoteWithoutAuth?: boolean;
    } | null;
  },
  creator?: {
    isActive: boolean | null;
    endedAt: Date | string | null;
    bookingsActive: boolean | null;
    videoActive: boolean | null;
    voiceActive: boolean | null;
    servicesActive: boolean | null;
    articlesActive: boolean | null;
    coursesActive: boolean | null;
    templatesActive: boolean | null;
    displayName: string | null;
    tagline: string | null;
    bio: string | null;
    categories: string[] | null;
  } | null,
) {
  const { firstName, lastName } = splitPersonName(row.name);
  const profileUpdatedAt = profile?.updatedAt ?? row.updatedAt ?? row.createdAt;

  // Privacy gating: redact contact fields for non-owners when toggled off.
  // Owners always see their own data. Defaults: email/phone/location hidden.
  const isOwner = privacyOptions?.isOwner ?? true;
  const showEmail = privacyOptions?.privacy?.showEmail ?? false;
  const showPhone = privacyOptions?.privacy?.showPhone ?? false;
  const showLocation = privacyOptions?.privacy?.showLocation ?? false;
  // Opt-in: when true, the frontend lets unauthenticated visitors view the
  // full /people/:slug page (no AuthOverlay sign-in mask) so creators /
  // service providers can share their profile as a promotion link.
  const promoteWithoutAuth = privacyOptions?.privacy?.promoteWithoutAuth ?? false;

  const visibleEmail = isOwner || showEmail ? row.email : null;
  const visiblePhone = isOwner || showPhone ? (profile?.phone ?? "") : null;
  const visibleLocation = isOwner || showLocation ? (profile?.location ?? "") : null;

  return {
    id: row.id,
    // #383 — return null (not "") when no custom slug is set so downstream
    // `?? id` fallbacks fire correctly. Frontend boundary coerces legacy
    // empty strings already; the proper-shape DTO removes the need.
    slug: profile?.customUrlSlug || null,
    email: visibleEmail,
    userName: row.email,
    showEmail,
    showPhone,
    showLocation,
    promoteWithoutAuth,
    data: {
      firstName,
      lastName,
      avatar: profile?.avatarUrl ?? "",
      headline: profile?.headline ?? "",
      summary: profile?.summary ?? "",
      location: visibleLocation,
      website: profile?.website ?? "",
      linkedIn: profile?.linkedIn ?? "",
      github: profile?.github ?? "",
      twitter: profile?.twitter ?? "",
      phone: visiblePhone,
      currentRole: profile?.currentRole ?? "",
      currentCompany: profile?.currentCompany ?? "",
      showEmail,
      showPhone,
      showLocation,
    },
    role: row.role,
    isPro: row.role === USER_ROLES.SUPER_ADMIN || row.role === USER_ROLES.ADMIN,
    isDemo: false,
    isVerified: row.emailVerified,
    profileVisibility: profile?.profileVisibility ?? "public",
    confidentialMode: profile?.confidentialMode ?? false,
    confidentialBlocklist: profile?.confidentialBlocklist ?? [],
    openToWork: profile?.openToWork ?? false,
    openToRemote: profile?.openToRemote ?? false,
    salaryCurrency: profile?.salaryCurrency ?? "USD",
    salaryExpectation: profile?.salaryExpectation ?? null,
    yearsOfExperience: profile?.yearsOfExperience ?? null,
    skills: profile?.skills ?? [],
    industries: profile?.industries ?? [],
    preferredRoles: profile?.preferredRoles ?? [],
    providesServices: profile?.providesServices ?? false,
    // Resolved client-friendly visibility map. The raw partial lives at
    // `profileSectionsRaw` (only set if the owner has stored overrides) so
    // the settings UI knows which keys were explicit vs. inherited from
    // `getDefaultProfileSections(role)`.
    profileSections: resolveProfileSections(
      (profile?.profileSections ?? null) as StoredProfileSections | null,
      row.role,
    ),
    profileSectionsRaw: (profile?.profileSections ?? null) as StoredProfileSections | null,
    isCreator: creator?.isActive === true && creator?.endedAt == null,
    creatorPrograms: {
      video: creator?.videoActive === true,
      voice: creator?.voiceActive === true,
      services: creator?.servicesActive === true,
      articles: creator?.articlesActive === true,
      courses: creator?.coursesActive === true,
      templates: creator?.templatesActive === true,
    },
    creatorProfile: creator
      ? {
          displayName: creator.displayName ?? null,
          tagline: creator.tagline ?? null,
          bio: creator.bio ?? null,
          categories: creator.categories ?? [],
        }
      : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(profileUpdatedAt).toISOString(),
    // Booking host handle (#1902) — lets the profile mount <BookingsSection/>.
    externalPublicHandle: row.externalPublicHandle ?? null,
    // Cheap enrollment flag so <BookingsSection/> can self-gate WITHOUT a
    // guaranteed-404 round-trip on every non-host profile view. SSoT is
    // creator_profiles.bookings_active (same source findHostByHandle reads).
    // Tri-state: `creator === undefined` means the caller (e.g. /me) didn't
    // load creator data → emit null so the client falls back to fetching
    // rather than wrongly hiding the section. When creator data WAS loaded
    // (the public :id detail path), an absent/inactive row is a definitive
    // "not a bookings host" → false, which is what enables the optimization.
    bookingsActive:
      creator === undefined
        ? null
        : creator?.bookingsActive === true && creator?.endedAt == null,
  };
}
