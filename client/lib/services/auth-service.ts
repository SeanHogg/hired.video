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
import { USER_ROLES } from "@shared/user-roles";

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
  role: z.enum([
    USER_ROLES.JOB_SEEKER,
    USER_ROLES.RECRUITER,
    USER_ROLES.EMPLOYER,
    USER_ROLES.AFFILIATE,
    USER_ROLES.ADMIN,
  ]).optional(),
  referralCode: z.string().trim().min(1).max(64).optional(),
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

// ============================================================================
// Role normalization
// ============================================================================

// Map backend role (string or number) to client role keys used by the UI
// - Server may return enum number (0=JobSeeker, 1=Recruiter, 2=Employer)
// - Or PascalCase strings (JobSeeker/Recruiter/Employer)
// - Our UI expects USER_ROLES constants: "JobSeeker" | "Recruiter" | "Employer"
// Note: Backend supports 3 roles: JobSeeker, Recruiter, Employer
function mapServerRole(role: string | number | undefined | null): string {
  if (role === undefined || role === null) return USER_ROLES.JOB_SEEKER;
  if (typeof role === "number") {
    switch (role) {
      case 0:
        return USER_ROLES.JOB_SEEKER;
      case 1:
        return USER_ROLES.RECRUITER;
      case 2:
        return USER_ROLES.EMPLOYER; // Backend enum value 2 = Employer
      default:
        return USER_ROLES.JOB_SEEKER;
    }
  }
  // string input
  const r = String(role).trim().toLowerCase();

  if (r === "jobseeker" || r === "job_seeker" || r === "job seeker")
    return USER_ROLES.JOB_SEEKER;
  if (r === "recruiter") return USER_ROLES.RECRUITER;
  if (r === "employer") return USER_ROLES.EMPLOYER;
  // If it's numeric-like string, coerce to number mapping
  const num = Number(r);
  if (!Number.isNaN(num)) return mapServerRole(num);

  return USER_ROLES.JOB_SEEKER;
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
    console.log("AuthService.login: Starting login process");

    const response = await apiClient.post<LoginResponse>(
      "/api/Auth/login",
      credentials,
      LoginResponseSchema, // shared + optional refreshToken
    );

    console.log("AuthService.login: API response received", response);

    // Store authentication data then fetch full profile to normalize user fields
    this.storeAuthData(response.data);
    console.log("AuthService.login: Auth data stored");

    try {
      await this.getCurrentUser();
      console.log("AuthService.login: Current user fetched successfully");
    } catch (e) {
      console.warn("Failed to load full profile after login", e);
    }

    console.log("AuthService.login: Login completed successfully");
    return response.data;
  }

  /**
   * Register new user
   */
  async register(userData: RegisterRequest): Promise<LoginResponse> {
    // Server uses email as username; no need to derive or send userName
    const payload = { ...userData } as const;

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
   * Logout user locally only (for cases where backend has already signed out the user)
   * Used after account deletion where the backend automatically signs out the user
   */
  logoutLocalOnly(): void {
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
   * Can be used when the backend has already signed out the user (e.g., after account deletion)
   */
  clearAuthData(): void {
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
