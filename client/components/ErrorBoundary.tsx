/**
 * React Error Boundary component
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */

import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';
import { Button } from '@/components/ui/button';
import type { AppError} from '@/lib/errors';
import { normalizeError, handleError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// ============================================================================
// ERROR BOUNDARY PROPS AND STATE
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'critical';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorId: string | null;
}

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const normalizedError = normalizeError(error);
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error: normalizedError,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const normalizedError = normalizeError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: this.props.level || 'component',
    });

    const { shouldLog, shouldReport } = handleError(normalizedError);

    // Log error
    if (shouldLog) {
      logger.error('Error Boundary caught error', {
        error: normalizedError.toJSON(),
        errorInfo,
        level: this.props.level,
      });
    }

    // Report error to external service (if configured)
    if (shouldReport) {
      this.reportError(normalizedError, errorInfo);
    }

    // Call custom error handler
    if (this.props.onError) {
      this.props.onError(normalizedError, errorInfo);
    }
  }

  private reportError = (error: AppError, errorInfo: ErrorInfo): void => {
    // TODO: Integrate with error reporting service (e.g., Sentry, Bugsnag)
    console.error('Error reported:', {
      error: error.toJSON(),
      errorInfo,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });
  };

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
    });
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      // Default fallback UI based on error level
      return this.renderDefaultFallback();
    }

    return this.props.children;
  }

  private renderDefaultFallback(): ReactNode {
    const { error, errorId } = this.state;
    const { level = 'component' } = this.props;

    if (!error) return null;

    // Critical level - full page error
    if (level === 'critical') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <AlertTriangle className="mx-auto h-16 w-16 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Application Error
            </h1>
            <p className="text-gray-600 mb-6">
              A critical error occurred. Please refresh the page or contact support if the problem persists.
            </p>
            <div className="space-y-3">
              <Button onClick={this.handleRetry} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            </div>
            {errorId && (
              <p className="text-xs text-gray-400 mt-4">
                Error ID: {errorId}
              </p>
            )}
          </div>
        </div>
      );
    }

    // Page level - page error
    if (level === 'page') {
      return (
        <div className="flex items-center justify-center min-h-96 px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-4">
              <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Page Error
            </h2>
            <p className="text-gray-600 mb-4">
              Something went wrong loading this page.
            </p>
            <div className="space-y-2">
              <Button onClick={this.handleRetry} size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} size="sm">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
            </div>
            {errorId && (
              <p className="text-xs text-gray-400 mt-3">
                Error ID: {errorId}
              </p>
            )}
          </div>
        </div>
      );
    }

    // Component level - inline error
    return (
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 mb-1">
              Component Error
            </h3>
            <p className="text-sm text-red-700 mb-3">
              This component encountered an error and couldn't render properly.
            </p>
            <Button 
              onClick={this.handleRetry} 
              size="sm" 
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-100"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
            {errorId && (
              <p className="text-xs text-red-600 mt-2">
                Error ID: {errorId}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// ============================================================================
// HIGHER-ORDER COMPONENT
// ============================================================================

/**
 * HOC that wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// ============================================================================
// HOOK FOR ERROR HANDLING
// ============================================================================

/**
 * Hook for handling errors in functional components
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<AppError | null>(null);

  const handleError = React.useCallback((error: unknown) => {
    const normalizedError = normalizeError(error);
    setError(normalizedError);
    
    // Log error
    logger.error('useErrorHandler caught error', {
      error: normalizedError.toJSON(),
    });
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  // Throw error to be caught by error boundary
  if (error) {
    throw error;
  }

  return { handleError, clearError };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default ErrorBoundary;
