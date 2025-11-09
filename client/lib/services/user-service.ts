/**
 * User Service
 * Handles user-related API operations including connections and profiles
 */

import { z } from "zod";
import { apiClient } from "../api-client";
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
  skills: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  openToWork: nullableBoolean(),
  slug: nullableString(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
  lastLoginAt: nullableString(),
  profileViews: nullableNumber(),
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

// Public users list item (metadata) from GET /api/Users/public
export const PublicUserSchema = z.object({
  id: nullableString(),
  slug: nullableString(),
  fullName: nullableString(),
  avatar: nullableString(),
  headline: nullableString(),
  location: nullableString(),
  currentRole: nullableString(),
  currentCompany: nullableString(),
  role: z
    .union([z.string(), z.number()])
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  isVerified: nullableBoolean(),
  isPremium: nullableBoolean(),
  openToWork: nullableBoolean(),
  skills: z
    .array(z.string())
    .nullable()
    .transform((val) => (val === null ? undefined : val))
    .optional(),
  profileViews: nullableNumber(),
  createdAt: nullableString(),
  updatedAt: nullableString(),
});

// Resume summary (normalized) returned by /api/Users/{id}/resumes
export const ResumeSummarySchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  views: z.number().optional(),
  isMaster: z.boolean().optional(),
  isActive: z.boolean().optional(),
  createdAt: z.string().optional(),
});
export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

// Accept both PascalCase and camelCase fields from the API
const RawResumeSchema = z.object({
  Id: z.string().optional(),
  id: z.string().optional(),
  Slug: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  Name: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  Title: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  Description: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  Views: z.number().nullable().optional(),
  views: z.number().nullable().optional(),
  IsMaster: z.boolean().nullable().optional(),
  isMaster: z.boolean().nullable().optional(),
  IsActive: z.boolean().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  CreationDateTimeFormatted: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

type RawResume = z.infer<typeof RawResumeSchema>;

const normalizeResume = (raw: RawResume): ResumeSummary => ({
  id: String(raw.Id ?? raw.id ?? ""),
  slug: raw.Slug ?? raw.slug ?? undefined,
  name: (raw.Name ?? raw.name ?? raw.Title ?? raw.title) ?? undefined,
  description: (raw.Description ?? raw.description) ?? undefined,
  views: (raw.Views ?? raw.views ?? undefined) ?? undefined,
  isMaster: (raw.IsMaster ?? raw.isMaster ?? undefined) ?? undefined,
  isActive: (raw.IsActive ?? raw.isActive ?? undefined) ?? undefined,
  createdAt: (raw.CreationDateTimeFormatted ?? raw.createdAt ?? undefined) ?? undefined,
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
export type UserFilters = z.infer<typeof UserFiltersSchema>;
export type PaginatedUsers = z.infer<typeof PaginatedUsersSchema>;
export type PaginatedPublicUsers = z.infer<typeof PaginatedPublicUsersSchema>;
export type SendConnectionRequest = z.infer<typeof SendConnectionRequestSchema>;

// ============================================================================
// USER SERVICE CLASS
// ============================================================================

export class UserService {
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

    const endpoint = `/api/Users/public${params.toString() ? `?${params.toString()}` : ""}`;
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
   * Get user by ID
   */
  async getUserById(id: string): Promise<UserProfile> {
    // Now using standard ApiResponse format
    const response = await apiClient.get<any>(`/api/Users/${id}`);
    const payload = response.data;

    console.log("UserService.getUserById: Raw API response:", response);
    console.log("UserService.getUserById: Payload:", payload);

    const dataBlock = payload?.data ?? {};
    console.log("UserService.getUserById: DataBlock:", dataBlock);

    const normalized: UserProfile = {
      id: String(payload.id ?? ""),
      email: payload.email ?? undefined,
      firstName: payload.firstName ?? dataBlock.firstName ?? undefined,
      lastName: payload.lastName ?? dataBlock.lastName ?? undefined,
      role:
        typeof payload.role === "number"
          ? String(payload.role)
          : (payload.role ?? undefined),
      profilePicture: (payload.profilePicture ?? dataBlock.avatar) || undefined,
      bio: dataBlock.summary ?? undefined,
      location: dataBlock.location ?? undefined,
      website: dataBlock.website ?? undefined,
      linkedIn: dataBlock.linkedIn ?? dataBlock.linkedin ?? undefined,
      github: dataBlock.gitHub ?? dataBlock.github ?? undefined,
      skills: Array.isArray(dataBlock.skills) ? dataBlock.skills : undefined,
      openToWork: dataBlock.openToWork ?? undefined,
      slug: payload.slug ?? undefined,
      createdAt: payload.createdAt ?? undefined,
      updatedAt: payload.updatedAt ?? undefined,
    };

    console.log("UserService.getUserById: Normalized profile:", normalized);
    console.log("UserService.getUserById: firstName:", normalized.firstName);
    console.log("UserService.getUserById: lastName:", normalized.lastName);
    console.log("UserService.getUserById: profilePicture:", normalized.profilePicture);

    return normalized;
  }

  /**
   * Get user by slug/username
   */
  async getUserBySlug(slug: string): Promise<UserProfile> {
    // Use the same endpoint as getUserById since the API supports both
    // The /api/Users/{id} endpoint accepts both GUID and slug
    const response = await apiClient.get<any>(`/api/Users/${slug}`);
    const payload = response.data;

    console.log("UserService.getUserBySlug: Raw API response:", response);
    console.log("UserService.getUserBySlug: Payload:", payload);

    const dataBlock = payload?.data ?? {};
    console.log("UserService.getUserBySlug: DataBlock:", dataBlock);

    const normalized: UserProfile = {
      id: String(payload.id ?? ""),
      email: payload.email ?? undefined,
      firstName: payload.firstName ?? dataBlock.firstName ?? undefined,
      lastName: payload.lastName ?? dataBlock.lastName ?? undefined,
      role:
        typeof payload.role === "number"
          ? String(payload.role)
          : (payload.role ?? undefined),
      profilePicture: (payload.profilePicture ?? dataBlock.avatar) || undefined,
      bio: dataBlock.summary ?? undefined,
      location: dataBlock.location ?? undefined,
      website: dataBlock.website ?? undefined,
      linkedIn: dataBlock.linkedIn ?? dataBlock.linkedin ?? undefined,
      github: dataBlock.gitHub ?? dataBlock.github ?? undefined,
      skills: Array.isArray(dataBlock.skills) ? dataBlock.skills : undefined,
      openToWork: dataBlock.openToWork ?? undefined,
      slug: payload.slug ?? undefined,
      createdAt: payload.createdAt ?? undefined,
      updatedAt: payload.updatedAt ?? undefined,
    };

    console.log("UserService.getUserBySlug: Normalized profile:", normalized);
    console.log("UserService.getUserBySlug: firstName:", normalized.firstName);
    console.log("UserService.getUserBySlug: lastName:", normalized.lastName);
    console.log("UserService.getUserBySlug: profilePicture:", normalized.profilePicture);

    return normalized;
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>(
      "/api/Users/me",
      UserProfileSchema,
    );
    return response.data;
  }

  /**
   * Update current user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const response = await apiClient.put<UserProfile>(
      "/api/Users/me",
      updates,
      UserProfileSchema,
    );
    return response.data;
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
      "/api/Users/connections",
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
      "/api/Users/me/connections",
      z.array(ConnectionSchema),
    );
    return response.data;
  }

  /**
   * Get pending connection requests
   */
  async getPendingConnectionRequests(): Promise<Connection[]> {
    const response = await apiClient.get<Connection[]>(
      "/api/Users/me/connections/pending",
      z.array(ConnectionSchema),
    );
    return response.data;
  }

  /**
   * Accept connection request
   */
  async acceptConnectionRequest(connectionId: string): Promise<void> {
    await apiClient.put(`/api/Users/connections/${connectionId}/accept`);
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
      `/api/Users/${userId}/connections`,
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
  ): Promise<Connection | null> {
    try {
      const response = await apiClient.get<Connection>(
        `/api/Users/connections/status?fromUserId=${fromUserId}&toUserId=${toUserId}`,
        ConnectionSchema,
      );
      return response.data;
    } catch (error) {
      // If no connection exists, return null
      return null;
    }
  }

  /**
   * Get recommended connections for current user
   */
  async getRecommendedConnections(): Promise<UserProfile[]> {
    const response = await apiClient.get<UserProfile[]>(
      "/api/Users/me/recommendations",
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
        `/api/Users/${userId}/can-message`,
        z.object({ canMessage: z.boolean() }),
      );
      return response.data.canMessage;
    } catch (error) {
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
      `/api/Users/${userId}/stats`,
      z.object({
        resumeCount: z.number(),
        connectionCount: z.number(),
        jobApplicationCount: z.number(),
      }),
    );
    return response.data;
  }

  /**
   * Get user's resumes (public resumes for other users, all resumes for current user)
   */
  async getUserResumes(userId: string): Promise<ResumeSummary[]> {
    const response = await apiClient.get<RawResume[]>(
      `/api/Users/${userId}/resumes`,
      z.array(RawResumeSchema),
    );
    return response.data.map((r) => normalizeResume(r));
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const userService = new UserService();

export default userService;
