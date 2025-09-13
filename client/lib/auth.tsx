import React, { createContext, useContext, useState, useEffect } from "react";
import { logger } from "./logger";
import { authService, type UserProfile, type EmailVerificationChallenge } from "./services/auth-service";
import type { TwoFactorChallenge as ServiceTwoFactorChallenge } from "./services/auth-service";

// Role constants to avoid hardcoded strings
import { USER_ROLES, type UserRole } from "@shared/user-roles";
export { USER_ROLES, type UserRole };

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string; // Computed from firstName + lastName
  role?: UserRole;
  onboardingComplete: boolean;
  subscription?: "free" | "pro" | "enterprise";
  avatar?: string;
  profilePicture?: string;
  bio?: string;
  location?: string;
  website?: string;
  linkedIn?: string;
  github?: string;
  phone?: string;
  skills?: string[];
  openToWork?: boolean;
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

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<boolean | TwoFactorChallengeUI | EmailVerificationChallengeUI>;
  verifyTwoFactor: (code: string) => Promise<boolean>;
  resendTwoFactorCode: () => Promise<boolean>;
  resendEmailVerification: () => Promise<boolean>;
  getVerificationStatus: () => Promise<{ email?: string; emailConfirmed: boolean; isEmailVerified: boolean; sentAt?: string; sendCount?: number }>;
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: UserRole,
    referralCode?: string,
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserRole: (role: UserRole) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  refreshUser: () => Promise<void>;
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to convert UserProfile to User
function userProfileToUser(profile: UserProfile): User {
  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    name: `${profile.firstName} ${profile.lastName}`,
    role: profile.role as UserRole,
    onboardingComplete: true, // Assume completed if profile exists
    avatar: profile.profilePicture,
    profilePicture: profile.profilePicture,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    linkedIn: profile.linkedIn,
    github: profile.github,
    phone: profile.phone,
    skills: profile.skills,
    openToWork: profile.openToWork,
  };
}

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser || null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      // Filter out SuperAdmin from registration - it's internal only
      const registrationRole = role === USER_ROLES.SUPER_ADMIN ? USER_ROLES.ADMIN : role;
      await authService.register({
        email,
        password,
        confirmPassword: password,
        firstName,
        lastName,
        role: registrationRole,
        referralCode,
      });
      const profile = authService.getStoredUser();
      if (profile) setUser(userProfileToUser(profile));
      return true;
    } catch (error) {
      console.error("Signup failed:", error);
      return false;
    } finally {
      setIsLoading(false);
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
    const token = authService.getToken();

    const headers = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Handle password change required error
      if (
        response.status === 403 &&
        errorData.error?.code === "PASSWORD_CHANGE_REQUIRED"
      ) {
        const error = new Error("PASSWORD_CHANGE_REQUIRED");
        (error as any).response = errorData;
        throw error;
      }

      // Handle other authentication errors
      if (response.status === 401) {
        await logout();
        throw new Error("Authentication required");
      }

      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return response.json();
  };

  const verifyTwoFactor = async (code: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      await authService.verifyTwoFactor(code);
      const profile = authService.getStoredUser();
      if (profile) setUser(userProfileToUser(profile));
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

  const getVerificationStatus = async (): Promise<{ email?: string; emailConfirmed: boolean; isEmailVerified: boolean; sentAt?: string; sendCount?: number }> => {
    try {
      return await authService.getVerificationStatus();
    } catch (error) {
      console.error("AuthContext.getVerificationStatus: failed", error);
      throw error;
    }
  };


  const value: AuthContextType = {
    user,
    login,
    verifyTwoFactor,
    resendTwoFactorCode,
    resendEmailVerification,
    getVerificationStatus,
    signup,
    logout,
    updateUserRole,
    updateProfile,
    completeOnboarding,
    isAuthenticated: !!user,
    isLoading,
    refreshUser,
    apiCall,
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
