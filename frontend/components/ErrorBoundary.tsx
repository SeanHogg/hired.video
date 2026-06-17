/**
 * React Error Boundary component
 * Catches JavaScript errors anywhere in the child component tree and displays fallback UI
 */

import { AlertTriangle, RefreshCw, Home, Copy, Send, Loader2 } from "lucide-react";
import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { normalizeError, handleError, type AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reportError } from "@/lib/error-tracking";
import { getRecentApiRequests, type ApiRequestLogEntry } from "@/lib/api-client";
import { isSuperAdminFromToken, emailFromToken } from "@/lib/auth-claims";
import { reportClientError } from "@/lib/error-report";

// ============================================================================
// ERROR BOUNDARY PROPS AND STATE
// ============================================================================

interface ErrorBoundaryOwnProps {
  children: ReactNode;
  fallback?: (error: AppError, retry: () => void) => ReactNode;
  onError?: (error: AppError, errorInfo: ErrorInfo) => void;
  level?: "page" | "component" | "critical";
}

type ErrorBoundaryProps = ErrorBoundaryOwnProps & WithTranslation;

type ReportStatus = "idle" | "sending" | "sent" | "failed";

interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorId: string | null;
  copyStatus: "idle" | "copied" | "failed";
  recentApiRequests: ApiRequestLogEntry[];
  reportStatus: ReportStatus;
  reportErrorMessage?: string;
}

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

class ErrorBoundaryClass extends Component<
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
      recentApiRequests: [],
      reportStatus: "idle",
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const normalizedError = normalizeError(error);
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Snapshot recent API requests at the moment of the crash
    const recentApiRequests = getRecentApiRequests();

    return {
      hasError: true,
      error: normalizedError,
      errorId,
      copyStatus: "idle",
      recentApiRequests,
      reportStatus: "idle",
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

  /** Whether the current viewer is a SuperAdmin (or the lead developer)
   *  and therefore allowed to see the raw stack-trace fallback. Read
   *  synchronously from the JWT in localStorage because this class
   *  component can't use the useAuth() hook. */
  private seesDeveloperView(): boolean {
    if (isSuperAdminFromToken()) return true;
    const email = emailFromToken();
    return email === "seanhogg@gmail.com";
  }

  private handleReportError = async (): Promise<void> => {
    const { error, errorId, recentApiRequests } = this.state;
    if (!error) return;
    this.setState({ reportStatus: "sending", reportErrorMessage: undefined });

    const result = await reportClientError({
      source: "boundary",
      message: error.message || error.name || "Unhandled React error",
      severity: this.props.level || "component",
      errorId: errorId ?? undefined,
      stack: error.stack,
      context: {
        name: error.name,
        code: error.code,
        statusCode: error.statusCode,
        errorContext: error.context,
        recentApiRequests: recentApiRequests.length > 0 ? recentApiRequests : undefined,
        viewerEmail: emailFromToken(),
      },
    });

    this.setState({
      reportStatus: result.ok ? "sent" : "failed",
      reportErrorMessage: result.errorMessage,
    });
  };

  private handleCopyErrorDetails = async (): Promise<void> => {
    const { error, errorId, recentApiRequests } = this.state;
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
      recentApiRequests: recentApiRequests.length > 0 ? recentApiRequests : undefined,
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
    const { error } = this.state;
    if (!error) return null;
    // Gate the raw-stack developer view by SuperAdmin role. Everyone
    // else gets a friendly "An error occurred — report it" panel that
    // hides the stack and exposes a one-click report button.
    if (!this.seesDeveloperView()) {
      return this.renderUserFallback();
    }
    return this.renderDeveloperFallback();
  }

  private renderUserFallback(): ReactNode {
    const { error, errorId, reportStatus, reportErrorMessage } = this.state;
    const { level = "component", t } = this.props;
    if (!error) return null;
    const sending = reportStatus === "sending";
    const sent = reportStatus === "sent";
    const failed = reportStatus === "failed";

    const reportButton = (
      <Button
        onClick={this.handleReportError}
        disabled={sending || sent}
        variant={sent ? "outline" : "default"}
        size={level === "component" ? "sm" : "default"}
      >
        {sending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("status.sending")}
          </>
        ) : sent ? (
          <>
            <Send className="mr-2 h-4 w-4" /> {t("status.reportSent")}
          </>
        ) : failed ? (
          <>
            <Send className="mr-2 h-4 w-4" /> {t("actions.tryAgain")}
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" /> {t("actions.reportError")}
          </>
        )}
      </Button>
    );

    const statusLine = sent ? (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">
        {t("messages.errorReportThanks")}
      </p>
    ) : failed ? (
      <p className="text-xs text-red-600 dark:text-red-400 mt-2">
        {reportErrorMessage ?? t("errors.reportSendFailed")}
      </p>
    ) : null;

    if (level === "critical") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full text-center">
            <AlertTriangle className="mx-auto h-16 w-16 text-red-500 mb-6" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {t("headings.errorOccurred")}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t("messages.errorReportPrompt")}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-2">
              {reportButton}
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" /> {t("actions.retry")}
              </Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="mr-2 h-4 w-4" /> {t("actions.goHome")}
              </Button>
            </div>
            {statusLine}
            {errorId && (
              <p className="text-xs text-muted-foreground mt-4">{t("labels.errorId", { id: errorId })}</p>
            )}
          </div>
        </div>
      );
    }

    if (level === "page") {
      return (
        <div className="flex items-center justify-center min-h-96 px-4 py-8">
          <div className="max-w-md w-full text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {t("headings.errorOccurred")}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t("messages.pageErrorReportPrompt")}
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-2">
              {reportButton}
              <Button variant="outline" size="sm" onClick={this.handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" /> {t("actions.tryAgain")}
              </Button>
              <Button variant="outline" size="sm" onClick={this.handleGoHome}>
                <Home className="mr-2 h-4 w-4" /> {t("actions.goHome")}
              </Button>
            </div>
            {statusLine}
            {errorId && (
              <p className="text-xs text-muted-foreground mt-3">{t("labels.errorId", { id: errorId })}</p>
            )}
          </div>
        </div>
      );
    }

    // Component level — inline, compact.
    return (
      <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-950/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
              {t("headings.errorOccurred")}
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              {t("messages.componentErrorReportPrompt")}
            </p>
            <div className="flex flex-wrap gap-2">
              {reportButton}
              <Button onClick={this.handleRetry} size="sm" variant="outline">
                <RefreshCw className="mr-1 h-3 w-3" /> {t("actions.retry")}
              </Button>
            </div>
            {statusLine}
            {errorId && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">{t("labels.errorId", { id: errorId })}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  private renderDeveloperFallback(): ReactNode {
    const { error, errorId } = this.state;
    const { level = "component" } = this.props;

    if (!error) return null;

    // Critical level - full page error
    if (level === "critical") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted px-4">
          <div className="max-w-4xl w-full">
            <div className="text-center mb-6">
              <div className="mb-6">
                <AlertTriangle className="mx-auto h-16 w-16 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-4">
                Application Error
              </h1>
              <p className="text-muted-foreground mb-6">
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
                <p className="text-xs text-muted-foreground mt-4">Error ID: {errorId}</p>
              )}
            </div>

            {/* Show detailed error information in development or always for debugging */}
            <div className="bg-card rounded-lg shadow-lg p-6 text-left">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
                <h3 className="text-lg font-semibold text-foreground">Error Details</h3>
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
                  <label className="text-sm font-medium text-foreground">Error Message:</label>
                  <pre className="mt-1 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900 overflow-x-auto">
                    {error.message}
                  </pre>
                </div>

                {error.code && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Error Code:</label>
                    <pre className="mt-1 p-3 bg-muted border border-border rounded text-sm text-foreground">
                      {error.code}
                    </pre>
                  </div>
                )}

                {error.statusCode && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Status Code:</label>
                    <pre className="mt-1 p-3 bg-muted border border-border rounded text-sm text-foreground">
                      {error.statusCode}
                    </pre>
                  </div>
                )}

                {error.stack && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Stack Trace:</label>
                    <pre className="mt-1 p-3 bg-muted border border-border rounded text-xs text-foreground overflow-x-auto max-h-64 overflow-y-auto">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {error.context && Object.keys(error.context).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Context:</label>
                    <pre className="mt-1 p-3 bg-muted border border-border rounded text-xs text-foreground overflow-x-auto">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  </div>
                )}

                {this.state.recentApiRequests.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Recent API Requests ({this.state.recentApiRequests.length}):
                    </label>
                    <div className="mt-1 space-y-2">
                      {this.state.recentApiRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-3 bg-muted border border-border rounded text-xs text-foreground"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{req.method}</span>
                            <span className="text-muted-foreground break-all">{req.url}</span>
                            {req.status != null && (
                              <span
                                className={`ml-auto font-mono ${
                                  req.status >= 400
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {req.status}
                              </span>
                            )}
                            {req.durationMs != null && (
                              <span className="text-muted-foreground">{req.durationMs}ms</span>
                            )}
                          </div>
                          {req.error && (
                            <div className="text-red-600 mb-1">Error: {req.error}</div>
                          )}
                          {req.responseBody != null && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Response body
                              </summary>
                              <pre className="mt-1 p-2 bg-card border border-border rounded overflow-x-auto max-h-48 overflow-y-auto">
                                {JSON.stringify(req.responseBody, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
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
              <h2 className="text-xl font-semibold text-foreground mb-3">
                Page Error
              </h2>
              <p className="text-muted-foreground mb-4">
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
                <p className="text-xs text-muted-foreground mt-3">Error ID: {errorId}</p>
              )}
            </div>

            {/* Show detailed error information */}
            <div className="bg-card rounded-lg shadow-lg p-6 text-left">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
                <h3 className="text-base font-semibold text-foreground">Error Details</h3>
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

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Error Message:</label>
                  <pre className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-900 overflow-x-auto">
                    {error.message}
                  </pre>
                </div>

                {error.code && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Error Code:</label>
                    <pre className="mt-1 p-2 bg-muted border border-border rounded text-sm text-foreground">
                      {error.code}
                    </pre>
                  </div>
                )}

                {error.stack && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Stack Trace:</label>
                    <pre className="mt-1 p-2 bg-muted border border-border rounded text-xs text-foreground overflow-x-auto max-h-48 overflow-y-auto">
                      {error.stack}
                    </pre>
                  </div>
                )}

                {this.state.recentApiRequests.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Recent API Requests ({this.state.recentApiRequests.length}):
                    </label>
                    <div className="mt-1 space-y-2">
                      {this.state.recentApiRequests.map((req) => (
                        <div
                          key={req.id}
                          className="p-2 bg-muted border border-border rounded text-xs text-foreground"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{req.method}</span>
                            <span className="text-muted-foreground break-all">{req.url}</span>
                            {req.status != null && (
                              <span
                                className={`ml-auto font-mono ${
                                  req.status >= 400
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {req.status}
                              </span>
                            )}
                          </div>
                          {req.error && (
                            <div className="text-red-600 mt-1">Error: {req.error}</div>
                          )}
                        </div>
                      ))}
                    </div>
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
            <pre className="mt-1 p-2 bg-card border border-red-200 rounded text-xs text-red-900 overflow-x-auto">
              {error.message}
            </pre>
          </div>

          {error.stack && (
            <div>
              <label className="text-xs font-medium text-red-800">Stack Trace:</label>
              <pre className="mt-1 p-2 bg-card border border-red-200 rounded text-xs text-red-700 overflow-x-auto max-h-32 overflow-y-auto">
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
// TRANSLATION-WRAPPED EXPORT
// ============================================================================

// withTranslation injects `t` and `i18n` props automatically; consumers see
// only the public own-props surface.
export const ErrorBoundary = withTranslation()(
  ErrorBoundaryClass,
) as unknown as React.ComponentType<ErrorBoundaryOwnProps>;

// ============================================================================
// HIGHER-ORDER COMPONENT
// ============================================================================

/**
 * HOC that wraps a component with an error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryOwnProps, "children">,
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
