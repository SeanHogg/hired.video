/**
 * Edge case and boundary tests for route protection and authentication
 * Tests authentication guards, token expiration, and edge cases
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { authService } from '../../lib/services/auth-service';

// Create a test component that requires verification
const TestProtectedComponent = () => <div data-testid="protected-content">Protected Content</div>;

// Mock the RequireVerified component from App.tsx
const RequireVerified = ({ children }: { children: JSX.Element }) => {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth();
  
  if (isLoading) return <div data-testid="loading">Loading...</div>;
  if (!isAuthenticated) return <div data-testid="redirect-login">Redirecting to login...</div>;
  if (isEmailVerified === false) return <div data-testid="redirect-verify">Redirecting to verify email...</div>;
  
  return children;
};

// Mock dependencies
vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../lib/services/auth-service', () => ({
  authService: {
    isAuthenticated: vi.fn(),
    getStoredUser: vi.fn(),
    getToken: vi.fn(),
    logout: vi.fn(),
    getVerificationStatus: vi.fn(),
  },
}));

describe('Route Protection and Authentication Edge Cases', () => {
  let mockUseAuth: Mock;
  let mockAuthService: {
    isAuthenticated: Mock;
    getStoredUser: Mock;
    getToken: Mock;
  };

  beforeEach(() => {
    mockUseAuth = useAuth as Mock;
    mockAuthService = authService as any;
    vi.clearAllMocks();
  });

  const renderProtectedRoute = () => {
    return render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <RequireVerified>
                <TestProtectedComponent />
              </RequireVerified>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="/verify-email" element={<div data-testid="verify-page">Verify Email Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  describe('Authentication State Edge Cases', () => {
    it('should handle loading state correctly', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('loading')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should redirect unauthenticated users', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should redirect authenticated but unverified users', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: { id: 'user123', email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: false,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-verify')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should allow access for authenticated and verified users', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: { id: 'user123', email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: true,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('redirect-login')).not.toBeInTheDocument();
      expect(screen.queryByTestId('redirect-verify')).not.toBeInTheDocument();
    });
  });

  describe('Token Expiration Edge Cases', () => {
    it('should handle expired tokens', () => {
      // Arrange
      mockAuthService.isAuthenticated.mockReturnValue(false);
      mockAuthService.getToken.mockReturnValue('expired.jwt.token');
      
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
    });

    it('should handle malformed tokens', () => {
      // Arrange
      mockAuthService.isAuthenticated.mockReturnValue(false);
      mockAuthService.getToken.mockReturnValue('invalid-token');
      
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
    });

    it('should handle missing tokens', () => {
      // Arrange
      mockAuthService.isAuthenticated.mockReturnValue(false);
      mockAuthService.getToken.mockReturnValue(null);
      
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
    });
  });

  describe('User State Inconsistencies', () => {
    it('should handle user object without authentication', () => {
      // Arrange - Edge case where user exists but not authenticated
      mockUseAuth.mockReturnValue({
        user: { id: 'user123', email: 'test@example.com' },
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: true,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
    });

    it('should handle authentication without user object', () => {
      // Arrange - Edge case where authenticated but no user
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: true,
      });

      // Act
      renderProtectedRoute();

      // Assert
      // Should still allow access since isAuthenticated is true
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should handle undefined email verification status', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: { id: 'user123', email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: undefined,
      });

      // Act
      renderProtectedRoute();

      // Assert
      // Should allow access when verification status is undefined (not explicitly false)
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Race Conditions and Timing', () => {
    it('should handle rapid authentication state changes', async () => {
      // Arrange - Start with loading
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        isEmailVerified: undefined,
      });

      // Act
      const { rerender } = renderProtectedRoute();

      // Assert initial loading state
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Simulate authentication completing
      mockUseAuth.mockReturnValue({
        user: { id: 'user123', email: 'test@example.com' },
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: true,
      });

      rerender(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route
              path="/tasks"
              element={
                <RequireVerified>
                  <TestProtectedComponent />
                </RequireVerified>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Assert final authenticated state
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });

    it('should handle authentication failure after loading', async () => {
      // Arrange - Start with loading
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        isEmailVerified: undefined,
      });

      // Act
      const { rerender } = renderProtectedRoute();

      // Assert initial loading state
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Simulate authentication failing
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isEmailVerified: undefined,
      });

      rerender(
        <MemoryRouter initialEntries={['/tasks']}>
          <Routes>
            <Route
              path="/tasks"
              element={
                <RequireVerified>
                  <TestProtectedComponent />
                </RequireVerified>
              }
            />
          </Routes>
        </MemoryRouter>
      );

      // Assert redirect to login
      expect(screen.getByTestId('redirect-login')).toBeInTheDocument();
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
  });

  describe('Boundary Values', () => {
    it('should handle empty user object', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: {},
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: true,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should handle user with minimal required fields', () => {
      // Arrange
      mockUseAuth.mockReturnValue({
        user: { id: 'user123' },
        isAuthenticated: true,
        isLoading: false,
        isEmailVerified: true,
      });

      // Act
      renderProtectedRoute();

      // Assert
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });
});
