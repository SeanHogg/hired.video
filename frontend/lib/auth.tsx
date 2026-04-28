import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "./logger";
import { authService, type UserProfile, type EmailVerificationChallenge , TwoFactorChallenge as ServiceTwoFactorChallenge } from "./services/auth-service";
import * as impersonationService from "./services/impersonation-service";
import { apiClient, setEmulationTokenGetter } from "./api-client";
import { PersonaPreviewContext } from "@/providers/PersonaPreviewProvider";

// Role constants to avoid hardcoded strings
import { USER_ROLES, type UserRole } from "@shared/user-roles";
export { USER_ROLES, type UserRole };

/**
 * User interface for frontend context
 * Extends UserProfile from API with computed/frontend-specific fields
 */
export interface User extends Omit<UserProfile, 'role' | 'createdAt' | 'updatedAt'> {
  name: string; // Computed from firstName + lastName
  role?: UserRole; // Typed enum instead of string
  onboardingComplete: boolean; // Frontend-specific flag
  avatar?: string; // Alias for profilePicture for backward compatibility
}

interface TwoFactorChallengeUI {
  requiresTwoFactor: true;
  email: string;
  expiresAt: string;
}

interface EmailVerificationChallengeUI {
  requiresEmailVerification: true;
  email?: string;
}

// ── Impersonation session state ───────────────────────────────────────────────
export interface ImpersonationSession {
  sessionId: string;
  token: string;           // emulation JWT — stored in memory only, never localStorage
  targetUser: { id: string; email: string; name: string };
  role: string;
  startedAt: string;
  expiresAt: string;
  debuggerEnabled: boolean;
}

interface AuthContextType {
  user: User | null;
  isSuperAdmin: boolean;
  // Impersonation
  impersonationSession: ImpersonationSession | null;
  isImpersonating: boolean;
  startImpersonation: (targetUserId: string, reason: string, enableDebugger?: boolean) => Promise<ImpersonationSession>;
  endImpersonation: () => Promise<void>;
  switchImpersonationRole: (role: string) => Promise<void>;
  // Auth
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<boolean | TwoFactorChallengeUI | EmailVerificationChallengeUI>;
  verifyTwoFactor: (code: string) => Promise<boolean>;
  resendTwoFactorCode: () => Promise<boolean>;
  resendEmailVerification: () => Promise<boolean>;
  loginWithToken: (token: string) => Promise<void>;
  getVerificationStatus: () => Promise<{ email?: string; emailConfirmed: boolean; sentAt?: string; sendCount?: number }>;
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: UserRole,
    referralCode?: string,
    enableAffiliate?: boolean,
    cfTurnstileToken?: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserRole: (role: UserRole) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isEmailVerified?: boolean;
  refreshUser: () => Promise<void>;
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to convert UserProfile to User
function userProfileToUser(profile: UserProfile): User {
  const effectiveRole = profile.role as UserRole;

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    name: `${profile.firstName} ${profile.lastName}`,
    role: effectiveRole,
    onboardingComplete: true, // Assume completed if profile exists
    avatar: profile.profilePicture,
    profilePicture: profile.profilePicture,
    bio: profile.bio,
    headline: profile.headline,
    location: profile.location,
    website: profile.website,
    linkedIn: profile.linkedIn,
    github: profile.github,
    twitter: profile.twitter,
    phone: profile.phone,
    skills: profile.skills,
    industries: profile.industries,
    openToWork: profile.openToWork,
    openToRemote: profile.openToRemote,
    preferredRoles: profile.preferredRoles,
    salaryExpectation: profile.salaryExpectation,
    salaryCurrency: profile.salaryCurrency,
    yearsOfExperience: profile.yearsOfExperience,
    isDemo: profile.isDemo,
    slug: profile.slug,
    currentRole: profile.currentRole,
    currentCompany: profile.currentCompany,
  };
}

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

// Resend the verification email at most once per minute per browser, so landing
// on the gate after login doesn't re-trigger a send on every mount.
async function maybeResendVerificationEmail(sentAt?: string): Promise<void> {
  const ONE_MINUTE_MS = 60_000;
  try {
    const lastSent = Number(localStorage.getItem("verify_email_last_sent_at") || 0);
    const serverSentMs = sentAt ? new Date(sentAt).getTime() : 0;
    const mostRecent = Math.max(lastSent, Number.isFinite(serverSentMs) ? serverSentMs : 0);
    if (mostRecent && Date.now() - mostRecent < ONE_MINUTE_MS) return;

    const ok = await authService.resendEmailVerification();
    if (ok) localStorage.setItem("verify_email_last_sent_at", String(Date.now()));
  } catch {
    // Best-effort; the gate also exposes a manual resend button.
  }
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser || null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean | undefined>(undefined);
  // Impersonation session — stored in memory only (never localStorage)
  const [impersonationSession, setImpersonationSession] = useState<ImpersonationSession | null>(null);
  const impersonationTokenRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // Register a module-level getter so apiClient can read the current emulation
  // token on each outgoing request. Stored in a ref so the getter identity is
  // stable across re-renders.
  useEffect(() => {
    impersonationTokenRef.current = impersonationSession?.token ?? null;
  }, [impersonationSession?.token]);

  useEffect(() => {
    setEmulationTokenGetter(() => impersonationTokenRef.current);
    return () => setEmulationTokenGetter(() => null);
  }, []);

  // Check auth consistency on every render - if we have a user but no auth token, clear the user
  useEffect(() => {
    if (user && !authService.isAuthenticated()) {
      console.log(
        "Auth Context: User exists but no auth token found, clearing user state",
      );
      setUser(null);
    }
  }, [user]);

  useEffect(() => {
    // Check for stored user and token on mount
    const initializeAuth = async () => {
      try {
        logger.info("AuthProvider: initializing auth");
        if (authService.isAuthenticated()) {
          logger.info("AuthProvider: authenticated; checking stored user");
          const storedUser = authService.getStoredUser();
          if (storedUser) {
            logger.info(
              "AuthProvider: found stored user; setting from storage (no /me fetch)",
            );
            setUser(userProfileToUser(storedUser));
          } else {
            // Do not call /users/me globally; defer to /profile page
            logger.info(
              "AuthProvider: no stored user; deferring /Users/me fetch until /profile",
            );
          }

          // Prime verification state early so route guards behave correctly
          try {
            const status = await authService.getVerificationStatus();
            setIsEmailVerified(status.emailConfirmed);
            if (!status.emailConfirmed) {
              await maybeResendVerificationEmail(status.sentAt);
            }
          } catch (err) {
            logger.warn?.("AuthProvider: failed to fetch verification status on init", err);
            setIsEmailVerified(undefined);
          }

          // Reclaim any orphaned impersonation session left behind by a page
          // reload (emulation tokens are memory-only, so after a reload the
          // backend row still exists but the frontend can no longer use it —
          // ending it frees the SA to start a new session).
          const storedForOrphanCheck = authService.getStoredUser();
          if (storedForOrphanCheck?.role === USER_ROLES.SUPER_ADMIN) {
            try {
              const active = await impersonationService.getActiveImpersonation();
              if (active?.id) {
                await impersonationService.endImpersonation(active.id);
              }
            } catch (err) {
              logger.warn?.("AuthProvider: orphan impersonation cleanup failed", err);
            }
          }
        } else {
          logger.info("AuthProvider: not authenticated; skipping user fetch");
        }
      } catch (error) {
        console.error("Failed to initialize auth:", error);
        logger.error("AuthProvider: initialization failed", error);
        // Clear invalid auth data
        await authService.logout();
      } finally {
        setIsLoading(false);
      }
    };

    // Listen for logout events from API client (401 errors, auth failures, etc.)
    const handleAuthLogout = () => {
      console.log(
        "Auth Context: Auth logout event received, clearing user state",
      );
      setUser(null);
    };

    // Any EMAIL_NOT_VERIFIED error anywhere in the app flips the gate.
    const handleEmailUnverified = () => {
      setIsEmailVerified((prev) => (prev === false ? prev : false));
    };

    // Also check localStorage periodically to detect if auth data was cleared externally
    const checkAuthConsistency = () => {
      if (user && !authService.isAuthenticated()) {
        console.log(
          "Auth Context: Detected auth data cleared externally, clearing user state",
        );
        setUser(null);
      }
    };

    window.addEventListener("auth-logout", handleAuthLogout);
    window.addEventListener("auth-email-unverified", handleEmailUnverified);

    // Check auth consistency every 1 second
    const authCheckInterval = setInterval(checkAuthConsistency, 1000);

    // Only initialize if no initial user is provided (for testing)
    if (initialUser === undefined) {
      initializeAuth();
    } else {
      setIsLoading(false);
    }

    return () => {
      window.removeEventListener("auth-logout", handleAuthLogout);
      window.removeEventListener("auth-email-unverified", handleEmailUnverified);
      clearInterval(authCheckInterval);
    };
  }, [initialUser]);

  const login = async (
    email: string,
    password: string,
    rememberMe = false,
  ): Promise<boolean | TwoFactorChallengeUI | EmailVerificationChallengeUI> => {
    try {
      console.log("AuthContext.login: Starting login process");
      setIsLoading(true);

      const result = await authService.login({ email, password, rememberMe });
      console.log("AuthContext.login: AuthService.login completed", result);

      // If email verification is required, surface that to the UI
      if (
        typeof result === "object" &&
        (result as any).requiresEmailVerification
      ) {
        const r = result as { requiresEmailVerification: true; email?: string };
        const ui: EmailVerificationChallengeUI = {
          requiresEmailVerification: true,
          email: r.email ?? email,
        };
        console.log("AuthContext.login: Email verification required", ui);
        setIsEmailVerified(false);
        await maybeResendVerificationEmail();
        return ui;
      }

      // If two-factor is required, return the minimal UI challenge info
      if (typeof result === "object" && (result as ServiceTwoFactorChallenge).requiresTwoFactor) {
        const challenge = result as ServiceTwoFactorChallenge;
        const uiChallenge: TwoFactorChallengeUI = {
          requiresTwoFactor: true,
          email: challenge.email,
          expiresAt: challenge.expiresAt,
        };
        console.log("AuthContext.login: Two-factor challenge returned", uiChallenge);
        return uiChallenge;
      }

      // Otherwise normal login success; set user from stored profile if available
      const profile = authService.getStoredUser();
      console.log("AuthContext.login: Retrieved stored user profile", profile);

      if (profile) {
        const user = userProfileToUser(profile);
        console.log("AuthContext.login: Converted profile to user", user);
        setUser(user);
        // After login, prime verification state lazily
        try {
          const status = await authService.getVerificationStatus();
          setIsEmailVerified(status.emailConfirmed);
          if (!status.emailConfirmed) {
            await maybeResendVerificationEmail(status.sentAt);
          }
        } catch {
          setIsEmailVerified(undefined);
        }
      }

      console.log("AuthContext.login: Login successful, returning true");
      return true;
    } catch (error) {
      console.error("AuthContext.login: Login failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: UserRole = USER_ROLES.JOB_SEEKER,
    referralCode?: string,
    enableAffiliate?: boolean,
    cfTurnstileToken?: string,
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      // Filter out SuperAdmin from registration - it's internal only
      const registrationRole = role === USER_ROLES.SUPER_ADMIN ? USER_ROLES.ADMIN : role;

      // Register now returns a verification challenge; do not set any auth state here
      await authService.register({
        email,
        password,
        confirmPassword: password,
        firstName,
        lastName,
        role: registrationRole,
        referralCode,
        enableAffiliate,
        cfTurnstileToken,
      });

      return true;
    } catch (error) {
      console.error("Signup failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithToken = async (token: string): Promise<void> => {
    localStorage.setItem("auth_token", token);
    try {
      const profile = await authService.getCurrentUser();
      if (profile) {
        setUser(userProfileToUser(profile));
      }
    } catch (err) {
      console.error("loginWithToken: failed to load user", err);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
    }
  };

  const updateUserRole = async (role: UserRole): Promise<void> => {
    if (user) {
      try {
        const updatedProfile = await authService.updateProfile({ role });
        setUser(userProfileToUser(updatedProfile));
      } catch (error) {
        console.error("Failed to update user role:", error);
        throw error;
      }
    }
  };

  const updateProfile = async (
    updates: Partial<UserProfile>,
  ): Promise<void> => {
    if (user) {
      try {
        const updatedProfile = await authService.updateProfile(updates);
        setUser(userProfileToUser(updatedProfile));
      } catch (error) {
        console.error("Failed to update profile:", error);
        throw error;
      }
    }
  };

  const refreshUser = async (): Promise<void> => {
    if (authService.isAuthenticated()) {
      try {
        const profile = await authService.getCurrentUser();
        setUser(userProfileToUser(profile));
      } catch (error) {
        console.error("Failed to refresh user:", error);
        throw error;
      }
    }
  };

  const completeOnboarding = () => {
    if (user) {
      const updatedUser = { ...user, onboardingComplete: true };
      setUser(updatedUser);
    }
  };

  const apiCall = async (
    url: string,
    options: RequestInit = {},
  ): Promise<any> => {
    try {
      // Use the configured apiClient which handles the correct base URL
      const method = (options.method as any) || "GET";
      const config = {
        method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        headers: options.headers as Record<string, string>,
        body: options.body,
      };

      const response = await apiClient.request(url, config);
      return response;
    } catch (error: any) {
      // Handle password change required error
      if (error.message === "PASSWORD_CHANGE_REQUIRED") {
        throw error;
      }

      // Handle authentication errors
      if (error.message?.includes("Authentication") || error.message?.includes("401")) {
        await logout();
        throw new Error("Authentication required");
      }

      throw error;
    }
  };

  const verifyTwoFactor = async (code: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      await authService.verifyTwoFactor(code);
      const profile = authService.getStoredUser();
      if (profile) setUser(userProfileToUser(profile));

      // After successful 2FA, prime verification status so route guards behave correctly
      try {
        const status = await authService.getVerificationStatus();
        setIsEmailVerified(status.emailConfirmed);
      } catch (err) {
        // Leave as undefined on failure; guards will avoid false redirects when loading
        setIsEmailVerified(undefined);
      }

      return true;
    } catch (error) {
      console.error("AuthContext.verifyTwoFactor: failed", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resendTwoFactorCode = async (): Promise<boolean> => {
    try {
      return await authService.resendTwoFactorCode();
    } catch (error) {
      console.error("AuthContext.resendTwoFactorCode: failed", error);
      return false;
    }
  };

  const resendEmailVerification = async (): Promise<boolean> => {
    try {
      return await authService.resendEmailVerification();
    } catch (error) {
      console.error("AuthContext.resendEmailVerification: failed", error);
      return false;
    }
  };

  const getVerificationStatus = async (): Promise<{ email?: string; emailConfirmed: boolean; sentAt?: string; sendCount?: number }> => {
    try {
      const status = await authService.getVerificationStatus();
      // Keep context state in sync so GlobalVerificationGate doesn't bounce
      // the user back to /verify-email after they confirm on another device
      // and click "I already verified".
      setIsEmailVerified(status.emailConfirmed);
      return status;
    } catch (error) {
      console.error("AuthContext.getVerificationStatus: failed", error);
      throw error;
    }
  };

  // ── Impersonation ─────────────────────────────────────────────────────────

  const isSuperAdmin = user?.role === USER_ROLES.SUPER_ADMIN;

  const startImpersonation = async (targetUserId: string, reason: string, enableDebugger = false): Promise<ImpersonationSession> => {
    const data = await impersonationService.startImpersonation(targetUserId, reason, enableDebugger);
    const session: ImpersonationSession = {
      sessionId: data.sessionId,
      token: data.token,
      targetUser: data.user,
      role: data.role,
      startedAt: data.startedAt,
      expiresAt: data.expiresAt,
      debuggerEnabled: enableDebugger,
    };
    setImpersonationSession(session);
    impersonationTokenRef.current = session.token;
    // Drop any cached admin-identity data so subsequent renders refetch as the
    // emulated user.
    queryClient.invalidateQueries();
    return session;
  };

  const endImpersonation = async (): Promise<void> => {
    if (!impersonationSession) return;
    try {
      await impersonationService.endImpersonation(impersonationSession.sessionId);
    } catch (err) {
      console.error("endImpersonation: failed to notify server", err);
    } finally {
      setImpersonationSession(null);
      impersonationTokenRef.current = null;
      queryClient.invalidateQueries();
    }
  };

  const switchImpersonationRole = async (role: string): Promise<void> => {
    if (!impersonationSession) return;
    const data = await impersonationService.switchImpersonationRole(impersonationSession.sessionId, role);
    setImpersonationSession((prev) =>
      prev ? { ...prev, token: data.token, role: data.role } : null,
    );
    impersonationTokenRef.current = data.token;
    queryClient.invalidateQueries();
  };

  const value: AuthContextType = {
    user,
    isSuperAdmin,
    impersonationSession,
    isImpersonating: impersonationSession !== null,
    startImpersonation,
    endImpersonation,
    switchImpersonationRole,
    login,
    verifyTwoFactor,
    resendTwoFactorCode,
    resendEmailVerification,
    loginWithToken,
    getVerificationStatus,
    signup,
    logout,
    updateUserRole,
    updateProfile,
    completeOnboarding,
    isAuthenticated: authService.isAuthenticated(),
    isLoading,
    isEmailVerified: isEmailVerified ?? (undefined as unknown as boolean),
    refreshUser,
    apiCall,
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType & { realUser: User | null } {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  // Non-throwing context read — useAuth can be called from components mounted
  // outside PersonaPreviewProvider (e.g. during initial auth bootstrap).
  const preview = useContext(PersonaPreviewContext);

  const realUser = context.user;
  const impersonationSession = context.impersonationSession;
  const personaPreview = preview?.personaPreview ?? null;

  // Memoize so consumers with `[user]` effect deps don't re-fire every render.
  // Build an effective user whose role (and impersonation target fields) reflect
  // the active impersonation or previewed role. isSuperAdmin stays on the REAL
  // role — SA-only UI (EmulationBar, Admin Panel guards) keeps working while
  // previewing as a non-SA role.
  return React.useMemo<AuthContextType & { realUser: User | null }>(() => {
    if (!realUser) return { ...context, realUser: null };

    if (impersonationSession) {
      return {
        ...context,
        user: {
          ...realUser,
          id: impersonationSession.targetUser.id,
          email: impersonationSession.targetUser.email,
          name: impersonationSession.targetUser.name,
          role: impersonationSession.role as UserRole,
        },
        realUser,
      };
    }

    // Tier preview is consumed directly by useSubscription / useTokenBudget,
    // so only the role needs to be reshaped here.
    if (personaPreview) {
      const effectiveRole = personaPreview as UserRole;
      if (effectiveRole === realUser.role) {
        return { ...context, realUser };
      }
      return {
        ...context,
        user: { ...realUser, role: effectiveRole },
        realUser,
      };
    }

    return { ...context, realUser };
  }, [context, realUser, impersonationSession, personaPreview]);
}
