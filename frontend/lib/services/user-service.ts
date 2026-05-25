/**
 * User Service
 * Handles user-related API operations including connections and profiles
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import { UnverifiedAccountError } from "../errors";
import { isVerificationKnownBlocked } from "../verification-gate";
import { nullableString, nullableNumber, nullableBoolean } from "@shared/api";

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

// Public users list item from GET /api/users/public
// Now returns full UserProfileDTO with computed properties
export const PublicUserSchema = z.object({
  id: nullableString(),
  // Discriminator the card-feed pipeline uses to route to PeopleCard. Without
  // this declared, Zod strips it and downstream `item.type === "people"`
  // checks (e.g. the Creators category filter) silently fail.
  type: z.literal("people").optional(),
  slug: nullableString(),
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
  createdAt: nullableString(),
  updatedAt: nullableString(),
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
export type PublicUser = z.infer<typeof PublicUserSchema>;
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
      creatorPrograms: payload.creatorPrograms ?? undefined,
      creatorProfile: payload.creatorProfile ?? undefined,
      slug: payload.slug || undefined,
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
  async getPublicUsers(filters?: UserFilters): Promise<PaginatedPublicUsers> {
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
   * Get current user profile (/api/users/me).
   * Short-circuits via the shared verification gate so unverified
   * sessions don't burn a 403 round-trip on each studio / intake mount.
   */
  async getCurrentUser(): Promise<UserProfile> {
    if (isVerificationKnownBlocked()) {
      throw new UnverifiedAccountError("Email verification required");
    }
    const response = await apiClient.get<PublicUser>(
      "/api/users/me",
      PublicUserSchema,
    );
    return this.normalizePublicUserToProfile(response.data);
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
    await apiClient.delete(`/api/Users/connections/${connectionId}`);
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
