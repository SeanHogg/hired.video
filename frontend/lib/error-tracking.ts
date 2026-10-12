import * as Sentry from "@sentry/react";
import { runtimeConfig } from "@/lib/runtime-config";

// GlitchTip configuration
export const initializeErrorTracking = () => {
  const errorConfig = runtimeConfig.errorReporting;

  if (!errorConfig.ENABLED || !errorConfig.DSN) {
    console.log("Error tracking disabled or DSN not configured");
    return;
  }

  Sentry.init({
    dsn: errorConfig.DSN,
    environment: errorConfig.ENVIRONMENT,
    integrations: [
      // Basic browser integrations are included by default
    ],
    
    // Performance monitoring (basic)
    tracesSampleRate: errorConfig.SAMPLE_RATE,
    
    // Release tracking
    release: runtimeConfig.version,
    
    // Additional configuration
    beforeSend(event, hint) {
      // Filter out development errors in production
      if (runtimeConfig.isProduction && event.exception) {
        const error = hint.originalException;
        if (error instanceof Error) {
          // Skip common development errors
          if (error.message.includes("ResizeObserver loop limit exceeded")) {
            return null;
          }
          if (error.message.includes("Non-Error promise rejection captured")) {
            return null;
          }
        }
      }
      return event;
    },
    
    // Set user context
    initialScope: {
      tags: {
        component: "frontend",
      },
    },
  });

  console.log(`Error tracking initialized for ${errorConfig.ENVIRONMENT} environment`);
};

// Enhanced error reporting utilities
export const reportError = (error: Error, context?: Record<string, any>) => {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("additional", context);
    }
    Sentry.captureException(error);
  });
};

export const reportMessage = (message: string, level: "info" | "warning" | "error" = "info", context?: Record<string, any>) => {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("additional", context);
    }
    Sentry.captureMessage(message, level);
  });
};

export const setUserContext = (user: { id: string; email?: string; username?: string }) => {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.username,
  });
};

export const addBreadcrumb = (message: string, category: string, data?: Record<string, any>) => {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: "info",
  });
};

// Performance monitoring (basic)
export const startTransaction = (name: string, op: string) => {
  // Basic performance tracking without advanced Sentry features
  const start = performance.now();
  return {
    name,
    op,
    startTime: start,
    finish: () => {
      const duration = performance.now() - start;
      Sentry.addBreadcrumb({
        message: `Transaction: ${name}`,
        category: "performance",
        data: { op, duration: `${duration.toFixed(2)}ms` },
      });
    },
  };
};

// React Error Boundary integration
export const SentryErrorBoundary = Sentry.ErrorBoundary;