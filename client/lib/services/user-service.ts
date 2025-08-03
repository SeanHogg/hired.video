/**
 * User service - handles all user-related data operations
 */

import { z } from 'zod';
import { dataManager, DataManager, PaginationParams, FilterParams } from '../data-manager';
import { 
  LoginRequest, 
  LoginResponse, 
  SignupRequest,
  UserProfileResponse,
  UpdateUserProfileRequest,
  LoginRequestSchema,
  LoginResponseSchema,
  SignupRequestSchema,
  UserProfileResponseSchema,
  UpdateUserProfileRequestSchema
} from '@shared/api';
import { UserDataSchema } from '@shared/validation';
import { logger } from '../logger';

// ============================================================================
// USER SERVICE CLASS
// ============================================================================

export class UserService {
  constructor(private dataManager: DataManager = dataManager) {}

  // ============================================================================
  // AUTHENTICATION METHODS
  // ============================================================================

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    logger.info('User login attempt', { email: credentials.email });

    try {
      const response = await this.dataManager.create(
        '/auth/login',
        credentials,
        LoginRequestSchema,
        LoginResponseSchema
      );

      // Store auth token
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      logger.info('User login successful', { 
        userId: response.user.id,
        email: response.user.email 
      });

      return response;
    } catch (error) {
      logger.error('User login failed', { 
        email: credentials.email,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async signup(userData: SignupRequest): Promise<LoginResponse> {
    logger.info('User signup attempt', { email: userData.email });

    try {
      const response = await this.dataManager.create(
        '/auth/signup',
        userData,
        SignupRequestSchema,
        LoginResponseSchema
      );

      // Store auth token
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      logger.info('User signup successful', { 
        userId: response.user.id,
        email: response.user.email 
      });

      return response;
    } catch (error) {
      logger.error('User signup failed', { 
        email: userData.email,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async logout(): Promise<void> {
    logger.info('User logout');

    try {
      // Call logout endpoint to invalidate token on server
      await this.dataManager.create('/auth/logout', {}, z.object({}), z.object({}));
    } catch (error) {
      // Continue with local logout even if server call fails
      logger.warn('Server logout failed, continuing with local logout', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Clear local storage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    
    // Clear user-related cache
    this.dataManager.clearCache();

    logger.info('User logout completed');
  }

  async refreshToken(): Promise<LoginResponse> {
    logger.info('Token refresh attempt');

    try {
      const response = await this.dataManager.create(
        '/auth/refresh',
        {},
        z.object({}),
        LoginResponseSchema
      );

      // Update stored token
      localStorage.setItem('auth_token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));

      logger.info('Token refresh successful', { userId: response.user.id });

      return response;
    } catch (error) {
      logger.error('Token refresh failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Clear invalid token
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      
      throw error;
    }
  }

  // ============================================================================
  // PROFILE METHODS
  // ============================================================================

  async getCurrentUser(): Promise<UserProfileResponse> {
    logger.debug('Fetching current user profile');

    return this.dataManager.get(
      '/users/me',
      UserProfileResponseSchema,
      { useCache: true, cacheTtl: 300000 } // 5 minutes
    );
  }

  async getUserById(id: string): Promise<UserProfileResponse> {
    logger.debug('Fetching user profile', { userId: id });

    return this.dataManager.get(
      `/users/${id}`,
      UserProfileResponseSchema,
      { useCache: true, cacheTtl: 600000 } // 10 minutes
    );
  }

  async getUserBySlug(slug: string): Promise<UserProfileResponse> {
    logger.debug('Fetching user profile by slug', { slug });

    return this.dataManager.get(
      `/users/slug/${slug}`,
      UserProfileResponseSchema,
      { useCache: true, cacheTtl: 600000 } // 10 minutes
    );
  }

  async updateProfile(updates: UpdateUserProfileRequest): Promise<UserProfileResponse> {
    logger.info('Updating user profile', { updates: Object.keys(updates) });

    try {
      const response = await this.dataManager.update(
        '/users',
        'me',
        updates,
        UpdateUserProfileRequestSchema,
        UserProfileResponseSchema
      );

      // Update stored user data
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        const updatedUser = { ...user, ...response };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }

      logger.info('User profile updated successfully');

      return response;
    } catch (error) {
      logger.error('User profile update failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    logger.info('Uploading user avatar', { fileName: file.name, fileSize: file.size });

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      // Note: This would need a different API client method for file uploads
      // For now, using fetch directly
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      logger.info('Avatar upload successful', { avatarUrl: result.avatarUrl });

      return result;
    } catch (error) {
      logger.error('Avatar upload failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // ============================================================================
  // USER SEARCH AND LISTING
  // ============================================================================

  async searchUsers(
    query: string,
    filters: FilterParams = {},
    pagination: PaginationParams = {}
  ) {
    logger.debug('Searching users', { query, filters, pagination });

    const searchFilters = {
      ...filters,
      search: query,
    };

    return this.dataManager.list(
      '/users/search',
      UserProfileResponseSchema,
      pagination,
      searchFilters,
      { useCache: true, cacheTtl: 180000 } // 3 minutes
    );
  }

  async getUsers(
    filters: FilterParams = {},
    pagination: PaginationParams = {}
  ) {
    logger.debug('Fetching users list', { filters, pagination });

    return this.dataManager.list(
      '/users',
      UserProfileResponseSchema,
      pagination,
      filters,
      { useCache: true, cacheTtl: 180000 } // 3 minutes
    );
  }

  // ============================================================================
  // USER CONNECTIONS
  // ============================================================================

  async sendConnectionRequest(userId: string, message?: string): Promise<void> {
    logger.info('Sending connection request', { userId, hasMessage: !!message });

    await this.dataManager.create(
      '/connections',
      { userId, message },
      z.object({
        userId: z.string().uuid(),
        message: z.string().optional(),
      }),
      z.object({})
    );

    logger.info('Connection request sent successfully', { userId });
  }

  async acceptConnectionRequest(requestId: string): Promise<void> {
    logger.info('Accepting connection request', { requestId });

    await this.dataManager.update(
      '/connections',
      requestId,
      { status: 'accepted' },
      z.object({ status: z.literal('accepted') }),
      z.object({})
    );

    logger.info('Connection request accepted', { requestId });
  }

  async rejectConnectionRequest(requestId: string): Promise<void> {
    logger.info('Rejecting connection request', { requestId });

    await this.dataManager.update(
      '/connections',
      requestId,
      { status: 'rejected' },
      z.object({ status: z.literal('rejected') }),
      z.object({})
    );

    logger.info('Connection request rejected', { requestId });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  getCurrentUserId(): string | null {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.id;
      } catch {
        return null;
      }
    }
    return null;
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  }

  getStoredUser(): any | null {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const userService = new UserService();

export default userService;
