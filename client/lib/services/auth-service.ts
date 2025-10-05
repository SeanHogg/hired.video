/**
 * Authentication Service
 * Handles login, registration, and user authentication with backend APIs
 */

import { z } from "zod";
import { logger } from "../logger";
import { apiClient } from "../api-client";
import {
  LoginResponseSchema as SharedLoginResponseSchema,
  TwoFactorChallengeSchema,
  EmailVerificationChallengeSchema,
  type LoginResponse as SharedLoginResponse,
  type TwoFactorChallenge,
  type EmailVerificationChallenge,
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
  slug: z.string().optional().default(""),
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
  isDemo: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ============================================================================
// Role normalization
// ============================================================================

// Map backend role (string or number) to client role keys used by the UI
// - Server returns enum numbers from MyVideoResumeRoles: JobSeeker=30, Recruiter=40, Employer=20
// - Or PascalCase strings (JobSeeker/Recruiter/Employer)
// - Our UI expects USER_ROLES constants: "JobSeeker" | "Recruiter" | "Employer"
// Note: Backend supports roles: JobSeeker=30, Recruiter=40, Employer=20, Admin=0, SuperAdmin=-1
function mapServerRole(role: string | number | undefined | null): string {
  if (role === undefined || role === null) return USER_ROLES.JOB_SEEKER;
  if (typeof role === "number") {
    switch (role) {
      case 30:
        return USER_ROLES.JOB_SEEKER;
      case 40:
        return USER_ROLES.RECRUITER;
      case 20:
        return USER_ROLES.EMPLOYER;
      case 0:
        return USER_ROLES.ADMIN;
      case -1:
        return USER_ROLES.SUPER_ADMIN;
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
  slug?: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  profilePicture?: string;
  bio?: string;
  headline?: string;
  location?: string;
  website?: string;
  linkedIn?: string;
  github?: string;
  twitter?: string;
  phone?: string;
  currentRole?: string;
  currentCompany?: string;
  skills?: string[];
  industries?: string[];
  openToWork?: boolean;
  openToRemote?: boolean;
  preferredRoles?: string[];
  salaryExpectation?: number;
  salaryCurrency?: string;
  yearsOfExperience?: number;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  subscription?: "free" | "pro" | "enterprise";
};

// ============================================================================
// AUTH SERVICE CLASS
// ============================================================================

// Two-Factor (step-up) auth support (use shared schemas for consistency)
export { TwoFactorChallengeSchema } from "@shared/api";
export type { TwoFactorChallenge } from "@shared/api";

export const VerificationStatusSchema = z.object({
  email: z.string().email().optional(),
  emailConfirmed: z.boolean(),
  isEmailVerified: z.boolean(),
  sentAt: z.string().optional(),
  sendCount: z.number().int().nonnegative().optional(),
});
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export { EmailVerificationChallengeSchema } from "@shared/api";
export type { EmailVerificationChallenge } from "@shared/api";

export class AuthService {
  private tokenKey = "auth_token";
  private refreshTokenKey = "refresh_token";
  private userKey = "current_user";


  private twoFactorKey = "twofactor_state";

  private storeTwoFactorState(challenge: TwoFactorChallenge): void {
    sessionStorage.setItem(this.twoFactorKey, JSON.stringify(challenge));
  }

  getTwoFactorState(): TwoFactorChallenge | null {
    const raw = sessionStorage.getItem(this.twoFactorKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const validation = TwoFactorChallengeSchema.safeParse(parsed);
      return validation.success ? validation.data : null;
    } catch {
      return null;
    }
  }

  clearTwoFactorState(): void {
    sessionStorage.removeItem(this.twoFactorKey);
  }

  /**
   * Login user with email and password
   * Returns either a LoginResponse (success), a TwoFactorChallenge (requires step 2),
   * or an EmailVerificationChallenge (email verification required before access)
   */
  async login(
    credentials: LoginRequest,
  ): Promise<LoginResponse | TwoFactorChallenge | EmailVerificationChallenge> {
    console.log("AuthService.login: Starting login process");

    try {
      // Do not pass schema here to allow union response (either LoginResponse or 2FA challenge)
      const response = await apiClient.post<any>("/api/Auth/login", credentials);

      console.log("AuthService.login: API response received", response);

      const data = response.data as unknown;

      // Check for 2FA challenge shape
      const tfValidation = TwoFactorChallengeSchema.safeParse(data);
      if (tfValidation.success) {
        const challenge = tfValidation.data;
        this.clearTwoFactorState();
        this.storeTwoFactorState(challenge);
        console.log("AuthService.login: Two-factor required", challenge);
        return challenge;
      }

      // Otherwise validate as successful login response
      const lrValidation = LoginResponseSchema.safeParse(data);
      if (!lrValidation.success) {
        throw new Error(
          `Unexpected login response shape: ${lrValidation.error?.message ?? "validation failed"}`,
        );
      }

      const loginData = lrValidation.data;

      // Store authentication data then fetch full profile to normalize user fields
      this.storeAuthData(loginData);
      console.log("AuthService.login: Auth data stored");

      try {
        await this.getCurrentUser();
        console.log("AuthService.login: Current user fetched successfully");
      } catch (e) {
        console.warn("Failed to load full profile after login", e);
      }

      console.log("AuthService.login: Login completed successfully");
      return loginData;
    } catch (error: any) {
      // Detect unverified account error bubbled from ApiClient
      if (error && (error.code === "ACCOUNT_UNVERIFIED" || /Email not verified/i.test(String(error.message)))) {
        console.warn("AuthService.login: Email verification required for", credentials.email);
        return { requiresEmailVerification: true, email: credentials.email };
      }
      throw error;
    }
  }

  /**
   * Verify a two-factor code using the stored temporary auth state
   */
  async verifyTwoFactor(code: string): Promise<LoginResponse> {
    const state = this.getTwoFactorState();
    if (!state) {
      throw new Error("No pending two-factor challenge");
    }

    // Backend expects { tempAuthToken, verificationCode }
    const payload = { tempAuthToken: state.tempAuthToken, verificationCode: code } as const;

    const result = await apiClient.post<LoginResponse>(
      "/api/Auth/verify-2fa",
      payload,
      LoginResponseSchema,
    );

    // On success, clear 2FA state, store auth, and load profile
    this.clearTwoFactorState();
    this.storeAuthData(result.data);
    try {
      await this.getCurrentUser();
    } catch (e) {
      console.warn("Failed to load full profile after 2FA verify", e);
    }

    return result.data;
  }

  /**
   * Resend the two-factor code for the current challenge
   */
  async resendTwoFactorCode(): Promise<boolean> {
    const state = this.getTwoFactorState();
    if (!state) {
      throw new Error("No pending two-factor challenge");
    }

    try {
      await apiClient.post("/api/Auth/resend-2fa", {
        tempAuthToken: state.tempAuthToken,
      });
      return true;
    } catch (e) {
      console.error("AuthService.resendTwoFactorCode: failed", e);
      return false;
    }
  }

  /**
   * Email verification status for the authenticated user
   */
  async getVerificationStatus(): Promise<VerificationStatus> {
    const res = await apiClient.get<VerificationStatus>(
      "/api/Auth/verification-status",
      VerificationStatusSchema,
    );
    return res.data;
  }

  /**
   * Resend verification email for the authenticated user
   */
  async resendEmailVerification(): Promise<boolean> {
    try {
      await apiClient.post("/api/Auth/resend-email-verification");
      return true;
    } catch (e) {
      console.error("AuthService.resendEmailVerification: failed", e);
      return false;
    }
  }

  /**
   * Register new user
   * Returns an EmailVerificationChallenge payload when verification email is sent.
   */
  async register(userData: RegisterRequest): Promise<EmailVerificationChallenge> {
    const payload = { ...userData } as const;

    // Return a strongly-typed and validated payload via ApiClient
    const response = await apiClient.post<EmailVerificationChallenge>(
      "/api/Auth/register",
      payload,
      EmailVerificationChallengeSchema,
    );

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
      slug: dto.slug,
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
      isDemo: dto.isDemo ?? false,
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
      isDemo: dto.isDemo ?? false,
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

    // Check if token is expired using robust base64url decoding for JWT
    try {
      const parts = token.split(".");
      if (parts.length < 2) return false;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const json = atob(padded);
      const payload = JSON.parse(json) as { exp?: number };
      if (typeof payload.exp !== "number") {
        // If no exp present, assume valid (backend should include exp)
        return true;
      }
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
