/**
 * Comprehensive logging system
 * Provides structured logging with different levels and contexts
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  component?: string;
  action?: string;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  setContext(context: LogContext): void;
  setUserId(userId: string): void;
  setSessionId(sessionId: string): void;
  setRequestId(requestId: string): void;
}

// ============================================================================
// LOGGER IMPLEMENTATION
// ============================================================================

class AppLogger implements Logger {
  private globalContext: LogContext = {};
  private userId?: string;
  private sessionId?: string;
  private requestId?: string;

  constructor() {
    // Generate session ID on initialization
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldLog(level: LogLevel): boolean {
    const logLevels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    const currentLevel = this.getLogLevel();
    return logLevels[level] >= logLevels[currentLevel];
  }

  private getLogLevel(): LogLevel {
    try {
      // Use runtime config for log level
      const { runtimeConfig } = require("@/lib/runtime-config");
      return (runtimeConfig.logging.LEVEL as LogLevel) || "info";
    } catch (error) {
      // Fallback if runtime config is not available
      const defaultLevel = import.meta.env.MODE === "production" ? "info" : "debug";
      return (import.meta.env.VITE_LOG_LEVEL as LogLevel) || defaultLevel;
    }
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.globalContext, ...context },
      userId: this.userId,
      sessionId: this.sessionId,
      requestId: this.requestId,
    };
  }

  private formatLogEntry(entry: LogEntry): string {
    const { level, message, timestamp, context, userId, sessionId, requestId } =
      entry;

    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const userInfo = userId ? ` [User: ${userId}]` : "";
    const sessionInfo = sessionId ? ` [Session: ${sessionId}]` : "";
    const requestInfo = requestId ? ` [Request: ${requestId}]` : "";

    let logMessage = `${prefix}${userInfo}${sessionInfo}${requestInfo} ${message}`;

    if (context && Object.keys(context).length > 0) {
      logMessage += `\nContext: ${JSON.stringify(context, null, 2)}`;
    }

    return logMessage;
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const formattedMessage = this.formatLogEntry(entry);

    // Console output with appropriate method
    switch (entry.level) {
      case "debug":
        console.debug(formattedMessage);
        break;
      case "info":
        console.info(formattedMessage);
        break;
      case "warn":
        console.warn(formattedMessage);
        break;
      case "error":
        console.error(formattedMessage);
        break;
    }

    // Send to external logging service in production
    if (import.meta.env.MODE === "production") {
      this.sendToExternalService(entry);
    }

    // Store in local storage for debugging (limited entries)
    this.storeLocally(entry);
  }

  private sendToExternalService(entry: LogEntry): void {
    // Send to error tracking service for errors and warnings
    if (entry.level === "error" || entry.level === "warn") {
      try {
        // Dynamic import to avoid circular dependencies
        import("./error-tracking").then(({ reportMessage }) => {
          // Map log levels to error tracking levels
          const errorTrackingLevel = entry.level === "warn" ? "warning" : entry.level;
          reportMessage(entry.message, errorTrackingLevel as "error" | "info" | "warning", {
            ...entry.context,
            userId: entry.userId,
            sessionId: entry.sessionId,
            requestId: entry.requestId,
          });
        }).catch(() => {
          // Silently fail to avoid infinite logging loops
        });
      } catch {
        // Silently fail if error tracking is not available
      }
    }

    // TODO: Send all logs to external logging service if needed
    // fetch('/api/logs', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(entry),
    // }).catch(() => {
    //   // Silently fail to avoid infinite logging loops
    // });
  }

  private storeLocally(entry: LogEntry): void {
    try {
      const storageKey = "app_logs";
      let maxEntries = 100;
      
      // Use runtime config for max entries
      try {
        const { runtimeConfig } = require("@/lib/runtime-config");
        maxEntries = runtimeConfig.logging.MAX_ENTRIES;
      } catch {
        // Use default if runtime config not available
      }

      const existingLogs = JSON.parse(
        localStorage.getItem(storageKey) || "[]",
      ) as LogEntry[];
      const updatedLogs = [entry, ...existingLogs].slice(0, maxEntries);

      localStorage.setItem(storageKey, JSON.stringify(updatedLogs));
    } catch (error) {
      // Silently fail if localStorage is not available
    }
  }

  // Public methods
  debug(message: string, context?: LogContext): void {
    const entry = this.createLogEntry("debug", message, context);
    this.writeLog(entry);
  }

  info(message: string, context?: LogContext): void {
    const entry = this.createLogEntry("info", message, context);
    this.writeLog(entry);
  }

  warn(message: string, context?: LogContext): void {
    const entry = this.createLogEntry("warn", message, context);
    this.writeLog(entry);
  }

  error(message: string, context?: LogContext): void {
    const entry = this.createLogEntry("error", message, context);
    this.writeLog(entry);
  }

  setContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  // Utility methods
  clearContext(): void {
    this.globalContext = {};
  }

  getStoredLogs(): LogEntry[] {
    try {
      return JSON.parse(localStorage.getItem("app_logs") || "[]") as LogEntry[];
    } catch {
      return [];
    }
  }

  clearStoredLogs(): void {
    try {
      localStorage.removeItem("app_logs");
    } catch {
      // Silently fail
    }
  }
}

// ============================================================================
// LOGGER INSTANCE AND UTILITIES
// ============================================================================

// Create singleton logger instance
export const logger = new AppLogger();

// Performance logging utility
export function logPerformance(name: string, fn: () => void): void;
export function logPerformance<T>(name: string, fn: () => T): T;
export function logPerformance<T>(name: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();

  logger.debug(`Performance: ${name}`, {
    duration: `${(end - start).toFixed(2)}ms`,
    operation: name,
  });

  return result;
}

// Async performance logging utility
export async function logAsyncPerformance<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const end = performance.now();

    logger.debug(`Async Performance: ${name}`, {
      duration: `${(end - start).toFixed(2)}ms`,
      operation: name,
      status: "success",
    });

    return result;
  } catch (error) {
    const end = performance.now();

    logger.error(`Async Performance: ${name} (failed)`, {
      duration: `${(end - start).toFixed(2)}ms`,
      operation: name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

// Component logging utility
export function createComponentLogger(componentName: string) {
  return {
    debug: (message: string, context?: LogContext) =>
      logger.debug(message, { ...context, component: componentName }),
    info: (message: string, context?: LogContext) =>
      logger.info(message, { ...context, component: componentName }),
    warn: (message: string, context?: LogContext) =>
      logger.warn(message, { ...context, component: componentName }),
    error: (message: string, context?: LogContext) =>
      logger.error(message, { ...context, component: componentName }),
  };
}

// Action logging utility
export function logAction(action: string, context?: LogContext): void {
  logger.info(`Action: ${action}`, { ...context, action });
}

// User interaction logging
export function logUserInteraction(
  interaction: string,
  element?: string,
  context?: LogContext,
): void {
  logger.info(`User Interaction: ${interaction}`, {
    ...context,
    interaction,
    element,
    timestamp: new Date().toISOString(),
  });
}

// API call logging
export function logApiCall(
  method: string,
  url: string,
  status?: number,
  context?: LogContext,
): void {
  const level = status && status >= 400 ? "error" : "info";
  logger[level](`API Call: ${method} ${url}`, {
    ...context,
    method,
    url,
    status,
    type: "api_call",
  });
}

// Export default logger
export default logger;
