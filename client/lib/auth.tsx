import React, { createContext, useContext, useState, useEffect } from "react";
import { logger } from "./logger";
import {
  authService,
  type UserProfile,
} from "./services/auth-service";

// Role constants to avoid hardcoded strings
import { USER_ROLES, type UserRole } from "./user-roles";
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

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<boolean>;
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role?: UserRole,
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

    // Only initialize if no initial user is provided (for testing)
    if (initialUser === undefined) {
      initializeAuth();
    } else {
      setIsLoading(false);
    }
  }, [initialUser]);

  const login = async (
    email: string,
    password: string,
    rememberMe = false,
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      await authService.login({ email, password, rememberMe });
      const profile = authService.getStoredUser();
      if (profile) setUser(userProfileToUser(profile));
      return true;
    } catch (error) {
      console.error("Login failed:", error);
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
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      await authService.register({
        email,
        password,
        confirmPassword: password,
        firstName,
        lastName,
        role,
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

  const apiCall = async (url: string, options: RequestInit = {}): Promise<any> => {
    const token = authService.getToken();

    const headers = {
      'Content-Type': 'application/json',
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
      if (response.status === 403 && errorData.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
        const error = new Error('PASSWORD_CHANGE_REQUIRED');
        (error as any).response = errorData;
        throw error;
      }

      // Handle other authentication errors
      if (response.status === 401) {
        await logout();
        throw new Error('Authentication required');
      }

      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return response.json();
  };

  const value: AuthContextType = {
    user,
    login,
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
