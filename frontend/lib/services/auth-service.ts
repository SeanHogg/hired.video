/**
 * Authentication Service
 * Handles login, registration, and user authentication with backend APIs
 */

import { z } from "zod";
import { logger } from "../logger";
import { apiClient } from "../api-client";
import { UnverifiedAccountError } from "../errors";
import {
  isVerificationKnownBlocked,
  setVerificationGate,
} from "../verification-gate";
import {
  LoginResponseSchema as SharedLoginResponseSchema,
  TwoFactorChallengeSchema,
  EmailVerificationChallengeSchema,
  type LoginResponse as SharedLoginResponse,
  type TwoFactorChallenge,
  type EmailVerificationChallenge,
} from "@shared/api";
import { USER_ROLES } from "@shared/user-roles";
import { PublicUserSchema, type PublicUser } from "./user-service";

// ============================================================================
// SCHEMAS
// ============================================================================

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
  // Cloudflare Turnstile token from the login widget. Required by the
  // backend when TURNSTILE_SECRET_KEY is set; see Login.tsx.
  cfTurnstileToken: z.string().optional(),
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
    USER_ROLES.ADMIN,
  ]).optional(),
  referralCode: z.string().trim().min(1).max(64).optional(),
  enableAffiliate: z.boolean().optional(),
  // Inbound campaign attribution — populated by `attributionPayload()`
  // from the shared first-touch store (cookie). Backend caps at 128 chars
  // per column; the frontend just forwards what was captured.
  utmSource: z.string().max(128).optional(),
  utmMedium: z.string().max(128).optional(),
  utmCampaign: z.string().max(128).optional(),
  utmTerm: z.string().max(128).optional(),
  utmContent: z.string().max(128).optional(),
  landingReferrer: z.string().max(2048).optional(),
  // Cloudflare Turnstile token from the signup widget. The form must
  // populate this before submit when VITE_TURNSTILE_SITE_KEY is set.
  cfTurnstileToken: z.string().optional(),
  // Pre-auth UI locale the visitor picked via LocaleSwitcher before
  // submitting. Backend seeds this onto account_preferences so the very
  // first authed render lands on their pick instead of the DB default.
  language: z.string().max(16).optional(),
});

// Use the shared login response schema from @shared/api
export const LoginResponseSchema = SharedLoginResponseSchema.extend({
  // Allow optional refreshToken without tightening the shared contract
  refreshToken: z.string().optional(),
});

// Backend DTO for /api/users/me. Aliased to `PublicUserSchema` so that
// /api/users/me and /api/users/:id share one schema — they return the same
// payload from `toUserProfileDto`, and the schema must stay in lockstep.
export const UserProfileDTOSchema = PublicUserSchema;

// ============================================================================
// Role normalization
// ============================================================================

// Map backend role (string or number) to client role keys used by the UI
// - Server returns enum numbers from hiredvideoRoles: JobSeeker=30, Recruiter=40, Employer=20
// - Or PascalCase strings (JobSeeker/Recruiter/Employer)
// - Our UI expects USER_ROLES constants: "job_seeker" | "recruiter" | "employer"
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
  if (r === "admin") return USER_ROLES.ADMIN;
  if (r === "superadmin" || r === "super_admin") return USER_ROLES.SUPER_ADMIN;
  if (r === "affiliate") return USER_ROLES.EMPLOYER; // Affiliate is a service, not a role
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
export type UserProfileDTO = PublicUser;
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
  profileVisibility?: "public" | "private" | "connections";
  confidentialMode?: boolean;
  confidentialBlocklist?: string[];
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
};

// Writer-side type for `authService.updateProfile`. Lists exactly the fields
// the writer knows how to forward — adding a key here without a matching
// branch in `updateProfile` is a runtime no-op, which is the bug class this
// type was added to prevent.
//
// `summary` is included as a server-name alias for `bio` (the server stores
// `summary`; some callers — e.g. ProfileAudit — already have data under that
// name and shouldn't have to know the rename). Both fold into the same
// payload field; if both are passed, `summary` wins.
export type ProfileUpdate = Partial<
  Pick<
    UserProfile,
    | "firstName"
    | "lastName"
    | "bio"
    | "headline"
    | "location"
    | "website"
    | "linkedIn"
    | "github"
    | "twitter"
    | "phone"
    | "currentRole"
    | "currentCompany"
    | "skills"
    | "industries"
    | "openToWork"
    | "openToRemote"
    | "preferredRoles"
    | "salaryExpectation"
    | "salaryCurrency"
    | "yearsOfExperience"
    | "profilePicture"
    | "profileVisibility"
    | "role"
  >
> & {
  summary?: string;
  /** Confidential search mode (#1627) — opt out of the public people
   *  directory. Lives on the profile; forwarded as `confidentialMode`. */
  confidentialMode?: boolean;
  /** Confidential employer blocklist (#1679) — company names hidden from
   *  in recruiter search. */
  confidentialBlocklist?: string[];
  /** Per-section visibility map for /people/[id]. Partial of `ProfileSections`
   * (shared/profile-sections.ts); missing keys fall back to role defaults. */
  profileSections?: Record<string, boolean>;
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
      // Do not pass schema here to allow union response (either LoginResponse or 2FA challenge).
      // suppressErrorEvent: every auth surface (Login.tsx, the extension popup) renders
      // failures inline with bespoke recovery (TURNSTILE_FAIL → magic-link rescue,
      // UNAUTHORIZED → "invalid credentials", ACCOUNT_LOCKED → lockout copy). The global
      // GlobalErrorHandler toast would just be redundant noise on top of those.
      const response = await apiClient.request<any>("/api/auth/login", {
        method: "POST",
        body: credentials,
        suppressErrorEvent: true,
      });

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

      // Verification status first so we know whether `/me` is reachable.
      // `getVerificationStatus()` updates the module-level gate as a side
      // effect, so even if we skip the explicit check here every other
      // `/me` caller will short-circuit until the user verifies.
      try {
        const status = await this.getVerificationStatus();
        if (status.emailConfirmed) {
          await this.getCurrentUser();
          console.log("AuthService.login: Current user fetched successfully");
        } else {
          console.log("AuthService.login: skipping /me — email unverified");
        }
      } catch (e) {
        console.warn("Failed to load profile / verification after login", e);
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
   * Verify a two-factor code using the stored temporary auth state.
   * When `trustDevice` is true, the backend mints the `hv_trusted_device`
   * cookie so future logins from this browser skip the OTP step for 30 days.
   */
  async verifyTwoFactor(code: string, trustDevice = false): Promise<LoginResponse> {
    const state = this.getTwoFactorState();
    if (!state) {
      throw new Error("No pending two-factor challenge");
    }

    // Backend expects { tempAuthToken, verificationCode, trustDevice? }
    const payload = {
      tempAuthToken: state.tempAuthToken,
      verificationCode: code,
      trustDevice,
    } as const;

    // Same inline-error rationale as login() — the OTP form renders its own
    // "code invalid" / "expired" / "rate-limited" copy.
    const result = await apiClient.request<LoginResponse>(
      "/api/auth/verify-2fa",
      { method: "POST", body: payload, suppressErrorEvent: true },
      LoginResponseSchema,
    );

    // On success, clear 2FA state, store auth, and load profile.
    // Same gate as `login()` — skip `/me` for unverified accounts so the
    // verify-email page doesn't see a doomed 403 round-trip.
    this.clearTwoFactorState();
    this.storeAuthData(result.data);
    try {
      const status = await this.getVerificationStatus();
      if (status.emailConfirmed) {
        await this.getCurrentUser();
      }
    } catch (e) {
      console.warn("Failed to load profile / verification after 2FA verify", e);
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
      await apiClient.request("/api/auth/resend-2fa", {
        method: "POST",
        body: { tempAuthToken: state.tempAuthToken },
        suppressErrorEvent: true,
      });
      return true;
    } catch (e) {
      console.error("AuthService.resendTwoFactorCode: failed", e);
      return false;
    }
  }

  /**
   * Email verification status for the authenticated user.
   * Side effect: keeps the module-level verification gate in lockstep
   * with the response so subsequent `getCurrentUser()` calls don't fire
   * doomed `/me` requests.
   */
  async getVerificationStatus(): Promise<VerificationStatus> {
    const res = await apiClient.get<VerificationStatus>(
      "/api/auth/verification-status",
      VerificationStatusSchema,
    );
    setVerificationGate(res.data.emailConfirmed);
    return res.data;
  }

  /**
   * Resend verification email for the authenticated user
   */
  async resendEmailVerification(): Promise<boolean> {
    try {
      await apiClient.post("/api/auth/resend-email-verification");
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

    // Return a strongly-typed and validated payload via ApiClient.
    // suppressErrorEvent: Signup.tsx maps the server code (TURNSTILE_FAIL,
    // BREACHED_PASSWORD, MX_FAIL, CONFLICT, etc.) to inline copy via
    // mapAuthError — the global red toast would be redundant.
    const response = await apiClient.request<EmailVerificationChallenge>(
      "/api/auth/register",
      { method: "POST", body: payload, suppressErrorEvent: true },
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
      await apiClient.post("/api/auth/logout");
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
   * Map the backend `/api/users/me` DTO to the auth-context UserProfile.
   * Persists the result to localStorage as a side effect so callers reading
   * `userKey` see the same shape they got back.
   */
  private normalizeAndPersist(dto: UserProfileDTO): UserProfile {
    const data = dto.data ?? {};
    const normalized: UserProfile = {
      id: dto.id ?? "",
      slug: dto.slug || undefined,
      email: dto.email ?? "",
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      role: mapServerRole(dto.role),
      profilePicture: data.avatar ?? undefined,
      bio: data.summary ?? undefined,
      headline: data.headline ?? undefined,
      location: data.location ?? undefined,
      website: data.website ?? undefined,
      linkedIn: data.linkedIn ?? undefined,
      github: data.github ?? data.gitHub ?? undefined,
      twitter: data.twitter ?? undefined,
      phone: data.phone ?? undefined,
      currentRole: data.currentRole ?? undefined,
      currentCompany: data.currentCompany ?? undefined,
      skills: dto.skills,
      industries: dto.industries,
      openToWork: dto.openToWork ?? undefined,
      openToRemote: dto.openToRemote ?? undefined,
      preferredRoles: dto.preferredRoles,
      salaryExpectation: dto.salaryExpectation ?? undefined,
      salaryCurrency: dto.salaryCurrency ?? undefined,
      yearsOfExperience: dto.yearsOfExperience ?? undefined,
      profileVisibility: dto.profileVisibility ?? "public",
      confidentialMode: dto.confidentialMode ?? false,
      confidentialBlocklist: dto.confidentialBlocklist ?? [],
      isDemo: dto.isDemo ?? false,
      createdAt: dto.createdAt ?? new Date().toISOString(),
      updatedAt: dto.updatedAt ?? new Date().toISOString(),
    };

    localStorage.setItem(this.userKey, JSON.stringify(normalized));
    return normalized;
  }

  /**
   * Get current user profile.
   * Short-circuits when the verification gate says the session is in
   * verification limbo — `/me` would 403 anyway, no point round-tripping.
   * Throws `UnverifiedAccountError` so callers stay on the same code
   * path they would on a real 403 response.
   */
  async getCurrentUser(): Promise<UserProfile> {
    if (isVerificationKnownBlocked()) {
      logger.info("authService.getCurrentUser: skipped (email not verified)");
      throw new UnverifiedAccountError("Email verification required");
    }
    logger.info("authService.getCurrentUser: GET /api/users/me");
    const response = await apiClient.get<UserProfileDTO>(
      "/api/users/me",
      UserProfileDTOSchema,
    );
    logger.info("authService.getCurrentUser: response received");
    return this.normalizeAndPersist(response.data);
  }

  /**
   * Update current user profile.
   *
   * Field-name mapping (frontend → server) lives here and only here:
   *   - `bio` or `summary` → `summary` (summary wins if both passed)
   *   - `github`           → `gitHub`
   *   - `profilePicture`   → `avatar`
   * All other fields pass through with their UserProfile name. The accepted
   * input shape is `ProfileUpdate` — adding a field there without a branch
   * below is a runtime no-op, so keep the two in sync.
   */
  async updateProfile(updates: ProfileUpdate): Promise<UserProfile> {
    const payload: Record<string, unknown> = {};

    if (updates.firstName !== undefined) payload.firstName = updates.firstName;
    if (updates.lastName !== undefined) payload.lastName = updates.lastName;
    if (updates.summary !== undefined) payload.summary = updates.summary;
    else if (updates.bio !== undefined) payload.summary = updates.bio;
    if (updates.headline !== undefined) payload.headline = updates.headline;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.website !== undefined) payload.website = updates.website;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.currentRole !== undefined) payload.currentRole = updates.currentRole;
    if (updates.currentCompany !== undefined) payload.currentCompany = updates.currentCompany;
    if (updates.linkedIn !== undefined) payload.linkedIn = updates.linkedIn;
    if (updates.github !== undefined) payload.gitHub = updates.github;
    if (updates.twitter !== undefined) payload.twitter = updates.twitter;
    if (updates.skills !== undefined) payload.skills = updates.skills;
    if (updates.industries !== undefined) payload.industries = updates.industries;
    if (updates.preferredRoles !== undefined) payload.preferredRoles = updates.preferredRoles;
    if (updates.openToRemote !== undefined) payload.openToRemote = updates.openToRemote;
    if (updates.openToWork !== undefined) payload.openToWork = updates.openToWork;
    if (updates.salaryExpectation !== undefined) payload.salaryExpectation = updates.salaryExpectation;
    if (updates.salaryCurrency !== undefined) payload.salaryCurrency = updates.salaryCurrency;
    if (updates.yearsOfExperience !== undefined) payload.yearsOfExperience = updates.yearsOfExperience;
    if (updates.profilePicture !== undefined) payload.avatar = updates.profilePicture;
    if (updates.profileVisibility !== undefined) payload.profileVisibility = updates.profileVisibility;
    if (updates.confidentialMode !== undefined) payload.confidentialMode = updates.confidentialMode;
    if (updates.confidentialBlocklist !== undefined) payload.confidentialBlocklist = updates.confidentialBlocklist;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.profileSections !== undefined) payload.profileSections = updates.profileSections;

    logger.info("authService.updateProfile: PUT /api/users/me", payload);
    const response = await apiClient.put<UserProfileDTO>(
      "/api/users/me",
      payload,
      UserProfileDTOSchema,
    );
    logger.info("authService.updateProfile: response received");
    return this.normalizeAndPersist(response.data);
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
      "/api/auth/refresh",
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
