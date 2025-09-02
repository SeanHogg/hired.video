/**
 * Authentication Service
 * Handles login, registration, and user authentication with backend APIs
 */

import { z } from "zod";
import { logger } from "../logger";
import { apiClient } from "../api-client";
import {
  LoginResponseSchema as SharedLoginResponseSchema,
  type LoginResponse as SharedLoginResponse,
} from "@shared/api";
import { USER_ROLES } from "../auth";

// ============================================================================
// SCHEMAS
// ============================================================================

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum([USER_ROLES.JOB_SEEKER, USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.BUSINESS, USER_ROLES.ADMIN]).optional(),
});

// Use the shared login response schema from @shared/api
export const LoginResponseSchema = SharedLoginResponseSchema.extend({
  // Allow optional refreshToken without tightening the shared contract
  refreshToken: z.string().optional(),
});

// Matches /api/Users/me DTO structure (tolerant to backend enum serialization)
export const UserProfileDTOSchema = z.object({
  id: z.string(),
  email: z.string(),
  userName: z.string().optional().default(""),
  data: z.object({
    firstName: z.string().optional().default(""),
    lastName: z.string().optional().default(""),
    avatar: z.string().optional().default(""),
    headline: z.string().optional().default(""),
    summary: z.string().optional().default(""),
    location: z.string().optional().default(""),
    website: z.string().optional().default(""),
    linkedIn: z.string().optional().default(""),
    github: z.string().optional().default(""),
    phone: z.string().optional().default(""),
    currentRole: z.string().optional().default(""),
    currentCompany: z.string().optional().default(""),
  }),
  role: z.union([z.string(), z.number()]),
  isPremium: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Map backend role (string or number) to client role keys
function mapServerRole(role: string | number | undefined): string {
  if (role === undefined || role === null) return "job_seeker";
  if (typeof role === "string") {
    // Normalize known variants
    const r = role.toLowerCase();
    if (
      r === "jobseeker" ||
      r === "job_seeker" ||
      r === "jobseeker" ||
      r === "jobseeker"
    )
      return "job_seeker";
    if (r === "recruiter") return "recruiter";
    if (r === "business" || r === "employer" || r === "company")
      return "business";
    // If it's numeric-like string ("0"), map below
    const num = Number(r);
    if (!Number.isNaN(num)) return mapServerRole(num);
    return r;
  }
  // Numeric enum mapping fallback
  switch (role) {
    case 0:
      return "job_seeker";
    case 1:
      return "recruiter";
    case 2:
      return "business";
    default:
      return "job_seeker";
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginResponse = SharedLoginResponse & { refreshToken?: string };
export type UserProfileDTO = z.infer<typeof UserProfileDTOSchema>;
export type UserProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePicture?: string;
  bio?: string;
  location?: string;
  website?: string;
  linkedIn?: string;
  github?: string;
  phone?: string;
  currentRole?: string;
  currentCompany?: string;
  skills?: string[];
  openToWork?: boolean;
  createdAt: string;
  updatedAt: string;
  subscription?: "free" | "pro" | "enterprise";
};

// ============================================================================
// AUTH SERVICE CLASS
// ============================================================================

export class AuthService {
  private tokenKey = "auth_token";
  private refreshTokenKey = "refresh_token";
  private userKey = "current_user";

  /**
   * Login user with email and password
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>(
      "/api/Auth/login",
      credentials,
      LoginResponseSchema, // shared + optional refreshToken
    );

    // Store authentication data then fetch full profile to normalize user fields
    this.storeAuthData(response.data);
    try {
      await this.getCurrentUser();
    } catch (e) {
      console.warn("Failed to load full profile after login", e);
    }

    return response.data;
  }

  /**
   * Register new user
   */
  async register(userData: RegisterRequest): Promise<LoginResponse> {
    // Backend expects alphanumeric UserName; derive from first/last/email
    const deriveUserName = (): string => {
      const fromNames = `${userData.firstName}${userData.lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (fromNames && fromNames.length >= 3) return fromNames.slice(0, 32);
      const fromEmail =
        (userData as any).email
          ?.split("@")[0]
          ?.toLowerCase()
          ?.replace(/[^a-z0-9]/g, "") || "";
      if (fromEmail && fromEmail.length >= 3) return fromEmail.slice(0, 32);
      return `user${Date.now()}`;
    };

    const payload = { ...userData, userName: deriveUserName() } as any;

    const response = await apiClient.post<LoginResponse>(
      "/api/Auth/register",
      payload,
      LoginResponseSchema,
    );

    // Store authentication data then fetch full profile to normalize user fields
    this.storeAuthData(response.data);
    try {
      await this.getCurrentUser();
    } catch (e) {
      console.warn("Failed to load full profile after register", e);
    }

    return response.data;
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      // Call backend logout endpoint if it exists
      await apiClient.post("/api/Auth/logout");
    } catch (error) {
      // Continue with local logout even if backend call fails
      console.warn("Backend logout failed:", error);
    }

    // Clear local storage
    this.clearAuthData();
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<UserProfile> {
    logger.info("authService.getCurrentUser: GET /api/Users/me");
    const response = await apiClient.get<UserProfileDTO>(
      "/api/Users/me",
      UserProfileDTOSchema,
    );
    logger.info("authService.getCurrentUser: response received");

    const dto = response.data;
    const normalized: UserProfile = {
      id: dto.id,
      email: dto.email,
      firstName: dto.data.firstName ?? "",
      lastName: dto.data.lastName ?? "",
      role: mapServerRole(dto.role),
      profilePicture: dto.data.avatar,
      bio: dto.data.summary,
      location: dto.data.location,
      website: dto.data.website,
      linkedIn: dto.data.linkedIn,
      github: dto.data.github,
      phone: dto.data.phone,
      currentRole: dto.data.currentRole,
      currentCompany: dto.data.currentCompany,
      skills: undefined,
      openToWork: undefined,
      createdAt: dto.createdAt ?? new Date().toISOString(),
      updatedAt: dto.updatedAt ?? new Date().toISOString(),
      subscription: dto.isPremium ? "pro" : "free",
    };

    // Update stored user data
    localStorage.setItem(this.userKey, JSON.stringify(normalized));

    return normalized;
  }

  /**
   * Update current user profile
   */
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    // Map normalized fields to server DTO payload
    const payload: any = {};
    if (updates.firstName !== undefined) payload.firstName = updates.firstName;
    if (updates.lastName !== undefined) payload.lastName = updates.lastName;
    if (updates.bio !== undefined) payload.summary = updates.bio; // server expects 'summary'
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.website !== undefined) payload.website = updates.website;
    // Optional mappings if present in updates cast: phone/currentRole/currentCompany/headline
    const anyUpdates = updates as any;
    if (anyUpdates.phone !== undefined) payload.phone = anyUpdates.phone;
    if (anyUpdates.currentRole !== undefined)
      payload.currentRole = anyUpdates.currentRole;
    if (anyUpdates.currentCompany !== undefined)
      payload.currentCompany = anyUpdates.currentCompany;
    if (anyUpdates.headline !== undefined)
      payload.headline = anyUpdates.headline;

    logger.info("authService.updateProfile: PUT /api/Users/me", payload);
    const response = await apiClient.put<UserProfileDTO>(
      "/api/Users/me",
      payload,
      UserProfileDTOSchema,
    );
    logger.info("authService.updateProfile: response received");

    // Normalize response
    const dto = response.data;
    const normalized: UserProfile = {
      id: dto.id,
      email: dto.email,
      firstName: dto.data.firstName ?? "",
      lastName: dto.data.lastName ?? "",
      role: mapServerRole(dto.role),
      profilePicture: dto.data.avatar,
      bio: dto.data.summary,
      location: dto.data.location,
      website: dto.data.website,
      linkedIn: dto.data.linkedIn,
      github: dto.data.github,
      phone: dto.data.phone,
      currentRole: dto.data.currentRole,
      currentCompany: dto.data.currentCompany,
      skills: undefined,
      openToWork: undefined,
      createdAt: dto.createdAt ?? new Date().toISOString(),
      updatedAt: dto.updatedAt ?? new Date().toISOString(),
      subscription: dto.isPremium ? "pro" : "free",
    };

    // Update stored user data
    localStorage.setItem(this.userKey, JSON.stringify(normalized));

    return normalized;
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<LoginResponse> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await apiClient.post<LoginResponse>(
      "/api/Auth/refresh",
      { refreshToken },
      LoginResponseSchema,
    );

    // Store new authentication data
    this.storeAuthData(response.data);

    return response.data;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = localStorage.getItem(this.tokenKey);
    if (!token) return false;

    // Check if token is expired (basic check)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  }

  /**
   * Get stored authentication token
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Get stored user data
   */
  getStoredUser(): UserProfile | null {
    const userData = localStorage.getItem(this.userKey);
    if (!userData) return null;

    try {
      return JSON.parse(userData);
    } catch {
      return null;
    }
  }

  /**
   * Store authentication data in localStorage
   */
  private storeAuthData(authData: LoginResponse): void {
    localStorage.setItem(this.tokenKey, authData.token);
    localStorage.setItem(this.userKey, JSON.stringify(authData.user));
    logger.info("authService.storeAuthData: token and user stored");

    if (authData.refreshToken) {
      localStorage.setItem(this.refreshTokenKey, authData.refreshToken);
      logger.info("authService.storeAuthData: refresh token stored");
    }
  }

  /**
   * Clear all authentication data
   */
  private clearAuthData(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const authService = new AuthService();
export default authService;
