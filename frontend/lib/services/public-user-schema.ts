/**
 * PublicUserSchema — the wire DTO `toUserProfileDto` returns for
 * GET /api/users/me, /api/users/:id and /api/users/public items. Lives in its
 * own module so auth-service (owner of /api/users/me) and user-service
 * (public-profile projections) share it without importing each other's
 * load-time values.
 */
import { z } from "zod";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import { PitchSummarySchema } from "@shared/pitch";

// Public users list item from GET /api/users/public
// Now returns full UserProfileDTO with computed properties
export const PublicUserSchema = z.object({
  id: nullableString(),
  // Discriminator the card-feed pipeline uses to route to PeopleCard. Without
  // this declared, Zod strips it and downstream `item.type === "people"`
  // checks (e.g. the Creators category filter) silently fail.
  type: z.literal("people").optional(),
  slug: nullableString(),
  // Booking host handle (#1902) — declared so Zod doesn't strip it from the
  // detail response, which would leave <BookingsSection/> permanently empty.
  externalPublicHandle: nullableString(),
  email: nullableString(),
  userName: nullableString(),
  // Computed properties from nested Data object
  firstName: nullableString(),
  lastName: nullableString(),
  fullName: nullableString(),
  avatar: nullableString(),
  headline: nullableString(),
  location: nullableString(),
  currentRole: nullableString(),
  currentCompany: nullableString(),
  openToWork: nullableBoolean(),
  showEmail: nullableBoolean(),
  showPhone: nullableBoolean(),
  showLocation: nullableBoolean(),
  skills: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  // Nested data object
  data: z.object({
    firstName: nullableString(),
    lastName: nullableString(),
    avatar: nullableString(),
    headline: nullableString(),
    summary: nullableString(),
    location: nullableString(),
    website: nullableString(),
    linkedIn: nullableString(),
    github: nullableString(),
    gitHub: nullableString(),
    twitter: nullableString(),
    phone: nullableString(),
    currentRole: nullableString(),
    currentCompany: nullableString(),
    openToWork: nullableBoolean(),
    showEmail: nullableBoolean(),
    showPhone: nullableBoolean(),
    showLocation: nullableBoolean(),
    skills: z
      .array(z.string())
      .nullable()
      .transform((val) => (val === null ? undefined : val))
      .optional(),
  }).optional(),
  role: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  emailConfirmed: nullableBoolean(),
  isPro: nullableBoolean(),
  isDemo: nullableBoolean(),
  isVerified: nullableBoolean(),
  profileViews: nullableNumber(),
  isCreator: nullableBoolean(),
  // Bookings-host enrollment (#1902) — declared so Zod doesn't strip it,
  // which would force <BookingsSection/> back to its guaranteed-404 probe.
  bookingsActive: nullableBoolean(),
  creatorPrograms: z
    .object({
      video: z.boolean(),
      voice: z.boolean(),
      services: z.boolean(),
      articles: z.boolean(),
      courses: z.boolean(),
      templates: z.boolean(),
    })
    .nullable()
    .transform((v) => (v === null ? undefined : v))
    .optional(),
  // Top-level fields the backend `toUserProfileDto` sends alongside `data`.
  // Modelled here (not just on `data`) so callers reading them directly off
  // the DTO — like authService.getCurrentUser — don't have them stripped.
  profileVisibility: z.enum(["public", "private", "connections"]).optional(),
  confidentialMode: nullableBoolean(),
  confidentialBlocklist: z.array(z.string()).nullish(),
  openToRemote: nullableBoolean(),
  industries: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  preferredRoles: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  salaryExpectation: nullableNumber(),
  salaryCurrency: nullableString(),
  yearsOfExperience: nullableNumber(),
  providesServices: nullableBoolean(),
  // See UserProfileSchema — opt-in flag that lets unauthenticated visitors
  // view the full /people/:slug page.
  promoteWithoutAuth: nullableBoolean(),
  // Per-section visibility resolved server-side via
  // resolveProfileSections(stored, role) — every key always set. The raw
  // partial (only owner-set keys) ships alongside so the Settings UI can
  // distinguish "user toggled this" from "inherited from role default".
  profileSections: z.record(z.string(), z.boolean()).nullable().optional(),
  profileSectionsRaw: z.record(z.string(), z.boolean()).nullable().optional(),
  // Current video pitch (#2133) — declared so Zod doesn't strip it.
  pitch: PitchSummarySchema.nullish(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
});

export type PublicUser = z.infer<typeof PublicUserSchema>;
