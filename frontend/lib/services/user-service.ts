/**
 * User Service
 * Handles user-related API operations including connections and profiles
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { authService } from "./auth-service";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";
import { CARD_FIELDS_BY_KIND, serializeListFields } from "@shared/projection";
import { PitchSummarySchema } from "@shared/pitch";
import { PublicUserSchema, type PublicUser } from "./public-user-schema";

export { PublicUserSchema, type PublicUser } from "./public-user-schema";

// ============================================================================
// SCHEMAS
// ============================================================================

export const UserProfileSchema = z.object({
  id: nullableString(),
  email: nullableString(),
  firstName: nullableString(),
  lastName: nullableString(),
  // Backend may return numeric enum for role; accept string or number
  role: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((val) =>
      val === null ? undefined : typeof val === "number" ? String(val) : val,
    )
    .optional(),
  profilePicture: nullableString(),
  externalPublicHandle: nullableString(),
  bio: nullableString(),
  location: nullableString(),
  website: nullableString(),
  linkedIn: nullableString(),
  github: nullableString(),
  phone: nullableString(),
  currentRole: nullableString(),
  currentCompany: nullableString(),
  skills: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  industries: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  openToWork: nullableBoolean(),
  providesServices: nullableBoolean(),
  // Per-section visibility for /people/[id]. `profileSections` is
  // server-resolved (all keys present, role defaults merged in);
  // `profileSectionsRaw` is the partial of explicit owner overrides
  // (or null) — the Settings panel reads this to distinguish a user
  // toggle from an inherited default.
  profileSections: z.record(z.string(), z.boolean()).nullable().optional(),
  profileSectionsRaw: z.record(z.string(), z.boolean()).nullable().optional(),
  // When true, the owner has opted into a fully public profile that
  // unauthenticated visitors can view directly (no AuthOverlay). Designed
  // for creators / service providers using their profile as a promotion
  // link. Persisted on privacy_preferences server-side.
  promoteWithoutAuth: nullableBoolean(),
  // Creator program enrollment — drives the per-program tab strip on the
  // public profile. SSoT is `creator_profiles.*_active`.
  isCreator: nullableBoolean(),
  // Bookings-host enrollment (#1902). Lets <BookingsSection/> skip its
  // public-host fetch entirely for non-hosts instead of eating a 404.
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
  creatorProfile: z
    .object({
      displayName: nullableString(),
      tagline: nullableString(),
      bio: nullableString(),
      categories: z.array(z.string()).nullable().optional(),
    })
    .nullable()
    .transform((v) => (v === null ? undefined : v))
    .optional(),
  // The user's current video pitch (#2133) — a `purpose: "pitch"` studio
  // project, from GET /api/users/:id.
  pitch: PitchSummarySchema.nullish(),
  slug: nullableString(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
  lastLoginAt: nullableString(),
  profileViews: nullableNumber(),
  isVerified: nullableBoolean(),
  isPro: nullableBoolean(),
  subscription: nullableString(),
  // Nested data object from API - contains all the profile details
  data: z.object({
    firstName: nullableString(),
    lastName: nullableString(),
    avatar: nullableString(),
    headline: nullableString(),
    summary: nullableString(),
    location: nullableString(),
    website: nullableString(),
    linkedIn: nullableString(),
    gitHub: nullableString(),
    twitter: nullableString(),
    phone: nullableString(),
    skills: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    currentRole: nullableString(),
    currentCompany: nullableString(),
    yearsOfExperience: nullableNumber(),
    openToWork: nullableBoolean(),
    openToRemote: nullableBoolean(),
    preferredRoles: z.array(z.string()).optional(),
    salaryExpectation: nullableNumber(),
    salaryCurrency: nullableString(),
    showEmail: nullableBoolean(),
    showPhone: nullableBoolean(),
    showLocation: nullableBoolean(),
    allowMessaging: nullableBoolean(),
  }).optional(),
});

export const ConnectionSchema = z.object({
  id: z.string(),
  fromUserId: z.string(),
  toUserId: z.string(),
  status: z.enum(["pending", "accepted", "rejected"]),
  message: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fromUser: UserProfileSchema.optional(),
  toUser: UserProfileSchema.optional(),
});

export const ConnectionStatusSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(true) }).merge(ConnectionSchema),
  z.object({ connected: z.literal(false), status: z.literal("none") }),
]);

export const UserFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  skills: z.array(z.string()).optional(),
  openToWork: z.boolean().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

export const PaginatedUsersSchema = z.object({
  items: z
    .array(UserProfileSchema)
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  total: nullableNumber(),
  page: nullableNumber(),
  limit: nullableNumber(),
  hasNext: nullableBoolean(),
  hasPrev: nullableBoolean(),
});

// Matches API pagination shape for public users (accept both camelCase and PascalCase)
export const PaginatedPublicUsersSchema = z.object({
  items: z
    .array(PublicUserSchema)
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  Items: z
    .array(PublicUserSchema)
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  total: nullableNumber(),
  Total: nullableNumber(),
  page: nullableNumber(),
  Page: nullableNumber(),
  limit: nullableNumber(),
  Limit: nullableNumber(),
  totalPages: nullableNumber(),
  hasNextPage: nullableBoolean(),
  hasPreviousPage: nullableBoolean(),
  HasNextPage: nullableBoolean(),
  HasPreviousPage: nullableBoolean(),
});

export const SendConnectionRequestSchema = z.object({
  toUserId: z.string(),
  message: z.string().optional(),
});

// ============================================================================
// TYPES
// ============================================================================

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type UserFilters = z.infer<typeof UserFiltersSchema>;
export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;
export type PaginatedPublicUsers = z.infer<typeof PaginatedPublicUsersSchema>;
export type SendConnectionRequest = z.infer<typeof SendConnectionRequestSchema>;

// ============================================================================
// USER SERVICE CLASS
// ============================================================================

export class UserService {
  /**
   * Normalize a PublicUser DTO to UserProfile
   * Single source of truth for user data transformation
   */
  private normalizePublicUserToProfile(payload: any): UserProfile {
    const dataBlock = payload?.data ?? {};
    const showEmail = payload.showEmail ?? dataBlock.showEmail ?? false;
    const showPhone = payload.showPhone ?? dataBlock.showPhone ?? false;
    const showLocation = payload.showLocation ?? dataBlock.showLocation ?? false;

    return {
      id: String(payload.id ?? ""),
      // Server has already nulled email/phone/location for non-owners
      // when the corresponding privacy toggle is off, so just trust them.
      email: payload.email ?? undefined,
      firstName: payload.firstName ?? dataBlock.firstName ?? undefined,
      lastName: payload.lastName ?? dataBlock.lastName ?? undefined,
      role:
        typeof payload.role === "number"
          ? String(payload.role)
          : (payload.role ?? undefined),
      profilePicture: (payload.profilePicture ?? payload.avatar ?? dataBlock.avatar) || undefined,
      bio: dataBlock.summary ?? undefined,
      location: payload.location ?? dataBlock.location ?? undefined,
      website: dataBlock.website ?? undefined,
      linkedIn: dataBlock.linkedIn ?? dataBlock.linkedin ?? undefined,
      github: dataBlock.gitHub ?? dataBlock.github ?? undefined,
      phone: dataBlock.phone ?? undefined,
      currentRole: payload.currentRole ?? dataBlock.currentRole ?? undefined,
      currentCompany: payload.currentCompany ?? dataBlock.currentCompany ?? undefined,
      skills: Array.isArray(dataBlock.skills) ? dataBlock.skills : undefined,
      openToWork: payload.openToWork ?? dataBlock.openToWork ?? undefined,
      providesServices: payload.providesServices ?? undefined,
      promoteWithoutAuth: payload.promoteWithoutAuth ?? undefined,
      // Creator-program enrollment flags drive the per-program tabs on
      // PeopleDetail. Without these, the tab strip silently collapses to
      // just "Profile" even for fully-enrolled creators because the
      // PeopleDetail filter reads `profile.creatorPrograms?.[p]`.
      isCreator: payload.isCreator ?? undefined,
      bookingsActive: payload.bookingsActive ?? undefined,
      creatorPrograms: payload.creatorPrograms ?? undefined,
      creatorProfile: payload.creatorProfile ?? undefined,
      profileSections: payload.profileSections ?? undefined,
      profileSectionsRaw: payload.profileSectionsRaw ?? undefined,
      pitch: payload.pitch ?? null,
      slug: payload.slug || undefined,
      externalPublicHandle: payload.externalPublicHandle ?? undefined,
      createdAt: payload.createdAt ?? undefined,
      updatedAt: payload.updatedAt ?? undefined,
      isVerified: payload.isVerified ?? undefined,
      isPro: payload.isPro ?? undefined,
      subscription: payload.isPro ? "pro" : "free",
      // Mirror nested data block so consumers checking userProfile.data.* work.
      data: {
        firstName: dataBlock.firstName ?? null,
        lastName: dataBlock.lastName ?? null,
        avatar: dataBlock.avatar ?? null,
        headline: dataBlock.headline ?? null,
        summary: dataBlock.summary ?? null,
        location: dataBlock.location ?? null,
        website: dataBlock.website ?? null,
        linkedIn: dataBlock.linkedIn ?? null,
        gitHub: dataBlock.gitHub ?? dataBlock.github ?? null,
        twitter: dataBlock.twitter ?? null,
        phone: dataBlock.phone ?? null,
        currentRole: dataBlock.currentRole ?? null,
        currentCompany: dataBlock.currentCompany ?? null,
        showEmail,
        showPhone,
        showLocation,
      } as any,
    };
  }

  /**
   * Get all public users with optional filters
   */
  async getPublicUsers(
    filters?: UserFilters,
    options: { fields?: readonly string[] } = {},
  ): Promise<PaginatedPublicUsers> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v.toString()));
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    // `?fields=` projection (gap #1444) — default to the People card
    // subset; opt-out by passing `fields: []`.
    const fields = serializeListFields(
      "users",
      options.fields ?? CARD_FIELDS_BY_KIND.users,
    );
    if (fields) params.set("fields", fields);

    const endpoint = `/api/users/public${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiClient.get<any>(
      endpoint,
      PaginatedPublicUsersSchema,
    );

    const dto = response.data;
    const items = (dto.items || dto.Items || []) as unknown[];
    const total = (dto.total ?? dto.Total ?? items.length) as number;
    const page = (dto.page ?? dto.Page ?? 1) as number;
    const limit = (dto.limit ?? dto.Limit ?? (items.length || (filters?.limit ?? 0))) as number;

    return {
      items: items as any,
      total,
      page,
      limit,
      totalPages: Math.ceil((total || 0) / (limit || 1)),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    } as PaginatedPublicUsers;
  }

  /**
   * The viewer's accepted connections as People cards (#802). Powers the
   * Connections tab. Returns the same `PublicUser` shape as the Discover grid.
   */
  async getMyConnectionCards(): Promise<PublicUser[]> {
    const response = await apiClient.get<{ items: PublicUser[] }>(
      "/api/users/me/connections/cards",
    );
    return (response.data?.items ?? []) as PublicUser[];
  }

  /**
   * Server-side typeahead over the viewer's accepted connections — returns at
   * most `limit` cards, name/headline matched, ordered by name. Used by pickers
   * (e.g. review-invite) so a user with thousands of connections never ships the
   * whole list to the client.
   */
  async searchMyConnections(q: string, limit = 20): Promise<PublicUser[]> {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("limit", String(limit));
    const response = await apiClient.get<{ items: PublicUser[] }>(
      `/api/users/me/connections/search?${params.toString()}`,
    );
    return response.data?.items ?? [];
  }

  /**
   * Get user by ID or slug. The backend resolves both via /api/users/:id, so
   * callers don't need to know which form they have.
   *
   * Suppresses the global API-error toast: 403 (private profile) and 404
   * (no such user) are expected outcomes that consumers render inline.
   * Without this, navigating to a private profile pops a red toast on top
   * of the page's own "this profile is private" UI.
   */
  async getUserById(id: string): Promise<UserProfile> {
    const response = await apiClient.get<PublicUser>(
      `/api/users/${id}`,
      PublicUserSchema,
      { suppressErrorEvent: true },
    );
    return this.normalizePublicUserToProfile(response.data);
  }

  async getUserBySlug(slug: string): Promise<UserProfile> {
    return this.getUserById(slug);
  }

  /**
   * Current user in the public-profile projection. `/api/users/me` is owned
   * by authService (verification gate included); this only re-projects it.
   */
  async getCurrentUser(): Promise<UserProfile> {
    return this.normalizePublicUserToProfile(await authService.fetchCurrentUserDto());
  }

  /**
   * Search users with filters
   */
  async searchUsers(filters: UserFilters): Promise<PaginatedPublicUsers> {
    return this.getPublicUsers(filters);
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Send connection request
   */
  async sendConnectionRequest(
    request: SendConnectionRequest,
  ): Promise<Connection> {
    const response = await apiClient.post<Connection>(
      "/api/users/connections",
      request,
      ConnectionSchema,
    );
    return response.data;
  }

  /**
   * Get current user's connections
   */
  async getMyConnections(): Promise<Connection[]> {
    const response = await apiClient.get<Connection[]>(
      "/api/users/me/connections",
      z.array(ConnectionSchema),
    );
    return response.data;
  }

  /**
   * Get pending connection requests
   */
  async getPendingConnectionRequests(): Promise<Connection[]> {
    const response = await apiClient.get<Connection[]>(
      "/api/users/me/connections/pending",
      z.array(ConnectionSchema),
    );
    return response.data;
  }

  /**
   * Accept connection request
   */
  async acceptConnectionRequest(connectionId: string): Promise<void> {
    await apiClient.put(`/api/users/connections/${connectionId}/accept`);
  }

  /**
   * Reject connection request
   */
  async rejectConnectionRequest(connectionId: string): Promise<void> {
    await apiClient.delete(`/api/users/connections/${connectionId}`);
  }

  /**
   * Get connections for a specific user
   */
  async getUserConnections(userId: string): Promise<Connection[]> {
    const response = await apiClient.get<Connection[]>(
      `/api/users/${userId}/connections`,
      z.array(ConnectionSchema),
    );
    return response.data;
  }

  /**
   * Check connection status between two users
   */
  async getConnectionStatus(
    fromUserId: string,
    toUserId: string,
  ): Promise<ConnectionStatus> {
    const response = await apiClient.get<ConnectionStatus>(
      `/api/users/connections/status?fromUserId=${fromUserId}&toUserId=${toUserId}`,
      ConnectionStatusSchema,
    );
    return response.data;
  }

  /**
   * Batch-fetch connection statuses for multiple users relative to the current user.
   * Returns a map of userId -> ConnectionStatus.
   */
  async getConnectionStatuses(
    userIds: string[],
  ): Promise<Record<string, ConnectionStatus>> {
    if (userIds.length === 0) return {};
    const response = await apiClient.post<Record<string, ConnectionStatus>>(
      "/api/users/connections/statuses",
      { userIds },
    );
    return response.data;
  }

  /**
   * Get recommended connections for current user
   */
  async getRecommendedConnections(): Promise<UserProfile[]> {
    const response = await apiClient.get<UserProfile[]>(
      "/api/users/me/recommendations",
      z.array(UserProfileSchema),
    );
    return response.data;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if current user can message another user
   */
  async canMessageUser(userId: string): Promise<boolean> {
    try {
      const response = await apiClient.get<{ canMessage: boolean }>(
        `/api/users/${userId}/can-message`,
        z.object({ canMessage: z.boolean() }),
      );
      return response.data.canMessage;
    } catch {
      return false;
    }
  }

  /**
   * Get user's public activity/stats
   */
  async getUserStats(userId: string): Promise<{
    resumeCount: number;
    connectionCount: number;
    jobApplicationCount: number;
  }> {
    const response = await apiClient.get<{
      resumeCount: number;
      connectionCount: number;
      jobApplicationCount: number;
    }>(
      `/api/users/${userId}/stats`,
      z.object({
        resumeCount: z.number(),
        connectionCount: z.number(),
        jobApplicationCount: z.number(),
      }),
    );
    return response.data;
  }

  /**
   * Update the current user's custom URL slug.
   */
  async updateSlug(slug: string): Promise<{ slug?: string | null }> {
    const response = await apiClient.patch<{ slug?: string | null }>(
      "/api/users/slug",
      { slug },
      z.object({ slug: z.string().nullish() }),
    );
    return response.data;
  }

  /**
   * Check if a slug is available.
   */
  async checkSlug(slug: string): Promise<{ available: boolean }> {
    try {
      const response = await apiClient.get<{ available: boolean }>(
        `/api/users/check-slug/${encodeURIComponent(slug)}`,
        z.object({ available: z.boolean() }),
      );
      return response.data;
    } catch {
      return { available: false };
    }
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const userService = new UserService();

export default userService;
