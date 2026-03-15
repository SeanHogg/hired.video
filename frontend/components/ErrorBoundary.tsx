/**
 * React Error Boundary component
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */

import { AlertTriangle, RefreshCw, Home, Copy } from "lucide-react";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { normalizeError, handleError, type AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/error-tracking";

// ============================================================================
// ERROR BOUNDARY PROPS AND STATE
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
  level?: "page" | "component" | "critical";
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorId: string | null;
  copyStatus: "idle" | "copied" | "failed";
}

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      copyStatus: "idle",
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
      errorBoundary: this.props.level || "component",
    });

    const { shouldLog: _shouldLog, shouldReport } = handleError(normalizedError);

    // Always log error boundary errors regardless of status code
    // Error boundaries catch React errors that may not have HTTP status codes
    logger.error("Error Boundary caught error", {
      error: normalizedError.toJSON(),
      errorInfo,
      level: this.props.level,
      errorBoundary: true, // Flag to indicate this came from error boundary
    });

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
    // Log to console for immediate debugging
    console.error("Error Boundary: Error reported to external service", {
      error: error.toJSON(),
      errorInfo,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });

    // Report to Sentry/GlitchTip error tracking service
    try {
      reportError(error, {
        errorBoundary: true,
        level: this.props.level || "component",
        errorInfo: {
          componentStack: errorInfo.componentStack,
        },
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    } catch (reportingError) {
      // Silently fail if error reporting service is unavailable
      console.warn("Failed to report error to external service:", reportingError);
    }
  };

  private handleRetry = (): void => {
    // Actually reload the current page to retry the failed operation
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = "/";
  };

  private handleCopyErrorDetails = async (): Promise<void> => {
    const { error, errorId } = this.state;
    if (!error) {
      return;
    }

    const details = {
      errorId,
      level: this.props.level || "component",
      message: error.message,
      name: error.name,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      context: error.context,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      this.setState({ copyStatus: "copied" });
      window.setTimeout(() => this.setState({ copyStatus: "idle" }), 2000);
    } catch (copyError) {
      console.error("Failed to copy error details", copyError);
      this.setState({ copyStatus: "failed" });
      window.setTimeout(() => this.setState({ copyStatus: "idle" }), 2000);
    }
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
    const { level = "component" } = this.props;

    if (!error) return null;

    // Critical level - full page error
    if (level === "critical") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-4xl w-full">
            <div className="text-center mb-6">
              <div className="mb-6">
                <AlertTriangle className="mx-auto h-16 w-16 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Application Error
              </h1>
              <p className="text-gray-600 mb-6">
                A critical error occurred. Please refresh the page or contact
                support if the problem persists.
              </p>
              <div className="flex justify-center gap-3 mb-6">
                <Button onClick={this.handleRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button
                  variant="outline"
                  onClick={this.handleGoHome}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Button>
              </div>
              {errorId && (
                <p className="text-xs text-gray-400 mt-4">Error ID: {errorId}</p>
              )}
            </div>

            {/* Show detailed error information in development or always for debugging */}
            <div className="bg-white rounded-lg shadow-lg p-6 text-left">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
                <h3 className="text-lg font-semibold text-gray-900">Error Details</h3>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={this.handleCopyErrorDetails}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy details
                  </Button>
                  {this.state.copyStatus === "copied" && (
                    <span className="text-sm text-green-600">Copied!</span>
                  )}
                  {this.state.copyStatus === "failed" && (
                    <span className="text-sm text-red-600">Copy failed</span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Error Message:</label>
                  <pre className="mt-1 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900 overflow-x-auto">
                    {error.message}
                  </pre>
                </div>

                {error.code && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Error Code:</label>
                    <pre className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900">
                      {error.code}
                    </pre>
                  </div>
                )}

                {error.statusCode && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Status Code:</label>
                    <pre className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900">
                      {error.statusCode}
                    </pre>
                  </div>
                )}

                {error.stack && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Stack Trace:</label>
                    <pre className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 overflow-x-auto max-h-64 overflow-y-auto">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {error.context && Object.keys(error.context).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Context:</label>
                    <pre className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Page level - page error
    if (level === "page") {
      return (
        <div className="flex items-center justify-center min-h-96 px-4 py-8">
          <div className="max-w-3xl w-full">
            <div className="text-center mb-6">
              <div className="mb-4">
                <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                Page Error
              </h2>
              <p className="text-gray-600 mb-4">
                Something went wrong loading this page.
              </p>
              <div className="flex justify-center gap-2 mb-4">
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
                <p className="text-xs text-gray-400 mt-3">Error ID: {errorId}</p>
              )}
            </div>

            {/* Show detailed error information */}
            <div className="bg-white rounded-lg shadow-lg p-6 text-left">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Error Details</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Error Message:</label>
                  <pre className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-900 overflow-x-auto">
                    {error.message}
                  </pre>
                </div>

                {error.code && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Error Code:</label>
                    <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900">
                      {error.code}
                    </pre>
                  </div>
                )}

                {error.stack && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Stack Trace:</label>
                    <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 overflow-x-auto max-h-48 overflow-y-auto">
                      {error.stack}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Component level - inline error
    return (
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <div className="flex items-start mb-4">
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
              <p className="text-xs text-red-600 mt-2">Error ID: {errorId}</p>
            )}
          </div>
        </div>

        {/* Show detailed error information */}
        <div className="mt-3 space-y-2">
          <div>
            <label className="text-xs font-medium text-red-800">Error Message:</label>
            <pre className="mt-1 p-2 bg-white border border-red-200 rounded text-xs text-red-900 overflow-x-auto">
              {error.message}
            </pre>
          </div>

          {error.stack && (
            <div>
              <label className="text-xs font-medium text-red-800">Stack Trace:</label>
              <pre className="mt-1 p-2 bg-white border border-red-200 rounded text-xs text-red-700 overflow-x-auto max-h-32 overflow-y-auto">
                {error.stack}
              </pre>
            </div>
          )}
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
  errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">,
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
    logger.error("useErrorHandler caught error", {
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
