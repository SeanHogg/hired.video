/**
 * Environment configuration management
 * Centralized configuration with validation and type safety
 */

import { z } from "zod";

// ============================================================================
// CONFIGURATION SCHEMA
// ============================================================================

const ConfigSchema = z.object({
  // Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // API Configuration
  API_BASE_URL: z.string().default("/api"),
  API_TIMEOUT: z.coerce.number().min(1000).default(10000),
  API_RETRIES: z.coerce.number().min(0).max(10).default(3),

  // Authentication
  AUTH_TOKEN_KEY: z.string().default("auth_token"),
  AUTH_USER_KEY: z.string().default("user"),
  AUTH_REFRESH_THRESHOLD: z.coerce.number().min(60).default(300), // 5 minutes

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_MAX_ENTRIES: z.coerce.number().min(10).default(100),

  // Cache
  CACHE_TTL_DEFAULT: z.coerce.number().min(1000).default(300000), // 5 minutes
  CACHE_TTL_SHORT: z.coerce.number().min(1000).default(60000), // 1 minute
  CACHE_TTL_LONG: z.coerce.number().min(1000).default(3600000), // 1 hour
  CACHE_MAX_SIZE: z.coerce.number().min(10).default(1000),

  // Performance
  PERFORMANCE_MONITORING: z.coerce.boolean().default(false),
  PERFORMANCE_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // Error Reporting
  ERROR_REPORTING_ENABLED: z.coerce.boolean().default(false),
  ERROR_REPORTING_DSN: z.string().optional(),
  ERROR_REPORTING_ENVIRONMENT: z.string().optional(),

  // Feature Flags
  FEATURE_AI_CHAT: z.coerce.boolean().default(true),
  FEATURE_VIDEO_RESUMES: z.coerce.boolean().default(true),
  FEATURE_ANALYTICS: z.coerce.boolean().default(false),
  FEATURE_NOTIFICATIONS: z.coerce.boolean().default(true),

  // UI Configuration
  UI_THEME: z.enum(["light", "dark", "system"]).default("system"),
  UI_ANIMATIONS: z.coerce.boolean().default(true),
  UI_REDUCED_MOTION: z.coerce.boolean().default(false),

  // File Upload
  UPLOAD_MAX_SIZE: z.coerce.number().min(1024).default(10485760), // 10MB
  UPLOAD_ALLOWED_TYPES: z
    .string()
    .default("image/*,application/pdf,.doc,.docx"),

  // Pagination
  PAGINATION_DEFAULT_LIMIT: z.coerce.number().min(1).max(100).default(20),
  PAGINATION_MAX_LIMIT: z.coerce.number().min(1).max(1000).default(100),

  // Search
  SEARCH_DEBOUNCE_MS: z.coerce.number().min(100).default(300),
  SEARCH_MIN_QUERY_LENGTH: z.coerce.number().min(1).default(2),

  // AI Configuration
  OPENROUTER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("openai/gpt-4o"),
  AI_MAX_TOKENS: z.coerce.number().min(100).max(4000).default(1000),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),

  // External Services
  GOOGLE_ANALYTICS_ID: z.string().optional(),
  HOTJAR_ID: z.string().optional(),
  INTERCOM_APP_ID: z.string().optional(),
});

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): z.infer<typeof ConfigSchema> {
  const env = {
    // Environment
    NODE_ENV: import.meta.env.NODE_ENV,

    // API Configuration
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    API_TIMEOUT: import.meta.env.VITE_API_TIMEOUT,
    API_RETRIES: import.meta.env.VITE_API_RETRIES,

    // Authentication
    AUTH_TOKEN_KEY: import.meta.env.VITE_AUTH_TOKEN_KEY,
    AUTH_USER_KEY: import.meta.env.VITE_AUTH_USER_KEY,
    AUTH_REFRESH_THRESHOLD: import.meta.env.VITE_AUTH_REFRESH_THRESHOLD,

    // Logging
    LOG_LEVEL: import.meta.env.VITE_LOG_LEVEL,
    LOG_MAX_ENTRIES: import.meta.env.VITE_LOG_MAX_ENTRIES,

    // Cache
    CACHE_TTL_DEFAULT: import.meta.env.VITE_CACHE_TTL_DEFAULT,
    CACHE_TTL_SHORT: import.meta.env.VITE_CACHE_TTL_SHORT,
    CACHE_TTL_LONG: import.meta.env.VITE_CACHE_TTL_LONG,
    CACHE_MAX_SIZE: import.meta.env.VITE_CACHE_MAX_SIZE,

    // Performance
    PERFORMANCE_MONITORING: import.meta.env.VITE_PERFORMANCE_MONITORING,
    PERFORMANCE_SAMPLE_RATE: import.meta.env.VITE_PERFORMANCE_SAMPLE_RATE,

    // Error Reporting
    ERROR_REPORTING_ENABLED: import.meta.env.VITE_ERROR_REPORTING_ENABLED,
    ERROR_REPORTING_DSN: import.meta.env.VITE_ERROR_REPORTING_DSN,
    ERROR_REPORTING_ENVIRONMENT: import.meta.env
      .VITE_ERROR_REPORTING_ENVIRONMENT,

    // Feature Flags
    FEATURE_AI_CHAT: import.meta.env.VITE_FEATURE_AI_CHAT,
    FEATURE_VIDEO_RESUMES: import.meta.env.VITE_FEATURE_VIDEO_RESUMES,
    FEATURE_ANALYTICS: import.meta.env.VITE_FEATURE_ANALYTICS,
    FEATURE_NOTIFICATIONS: import.meta.env.VITE_FEATURE_NOTIFICATIONS,

    // UI Configuration
    UI_THEME: import.meta.env.VITE_UI_THEME,
    UI_ANIMATIONS: import.meta.env.VITE_UI_ANIMATIONS,
    UI_REDUCED_MOTION: import.meta.env.VITE_UI_REDUCED_MOTION,

    // File Upload
    UPLOAD_MAX_SIZE: import.meta.env.VITE_UPLOAD_MAX_SIZE,
    UPLOAD_ALLOWED_TYPES: import.meta.env.VITE_UPLOAD_ALLOWED_TYPES,

    // Pagination
    PAGINATION_DEFAULT_LIMIT: import.meta.env.VITE_PAGINATION_DEFAULT_LIMIT,
    PAGINATION_MAX_LIMIT: import.meta.env.VITE_PAGINATION_MAX_LIMIT,

    // Search
    SEARCH_DEBOUNCE_MS: import.meta.env.VITE_SEARCH_DEBOUNCE_MS,
    SEARCH_MIN_QUERY_LENGTH: import.meta.env.VITE_SEARCH_MIN_QUERY_LENGTH,

    // AI Configuration
    OPENROUTER_API_KEY: import.meta.env.VITE_OPENROUTER_API_KEY,
    AI_MODEL: import.meta.env.VITE_AI_MODEL,
    AI_MAX_TOKENS: import.meta.env.VITE_AI_MAX_TOKENS,
    AI_TEMPERATURE: import.meta.env.VITE_AI_TEMPERATURE,

    // External Services
    GOOGLE_ANALYTICS_ID: import.meta.env.VITE_GOOGLE_ANALYTICS_ID,
    HOTJAR_ID: import.meta.env.VITE_HOTJAR_ID,
    INTERCOM_APP_ID: import.meta.env.VITE_INTERCOM_APP_ID,
  };

  try {
    return ConfigSchema.parse(env);
  } catch (error) {
    console.error("Configuration validation failed:", error);
    throw new Error(
      "Invalid configuration. Please check your environment variables.",
    );
  }
}

// ============================================================================
// CONFIGURATION INSTANCE
// ============================================================================

export const config = loadConfig();

// ============================================================================
// CONFIGURATION UTILITIES
// ============================================================================

/**
 * Check if running in development mode
 */
export const isDevelopment = config.NODE_ENV === "development";

/**
 * Check if running in production mode
 */
export const isProduction = config.NODE_ENV === "production";

/**
 * Check if running in test mode
 */
export const isTest = config.NODE_ENV === "test";

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(feature: keyof typeof config): boolean {
  const value = config[feature];
  return typeof value === "boolean" ? value : false;
}

/**
 * Get API configuration
 */
export function getApiConfig() {
  return {
    baseUrl: config.API_BASE_URL,
    timeout: config.API_TIMEOUT,
    retries: config.API_RETRIES,
  };
}

/**
 * Get cache configuration
 */
export function getCacheConfig() {
  return {
    ttl: {
      default: config.CACHE_TTL_DEFAULT,
      short: config.CACHE_TTL_SHORT,
      long: config.CACHE_TTL_LONG,
    },
    maxSize: config.CACHE_MAX_SIZE,
  };
}

/**
 * Get logging configuration
 */
export function getLoggingConfig() {
  return {
    level: config.LOG_LEVEL,
    maxEntries: config.LOG_MAX_ENTRIES,
  };
}

/**
 * Get performance monitoring configuration
 */
export function getPerformanceConfig() {
  return {
    enabled: config.PERFORMANCE_MONITORING,
    sampleRate: config.PERFORMANCE_SAMPLE_RATE,
  };
}

/**
 * Get error reporting configuration
 */
export function getErrorReportingConfig() {
  return {
    enabled: config.ERROR_REPORTING_ENABLED,
    dsn: config.ERROR_REPORTING_DSN,
    environment: config.ERROR_REPORTING_ENVIRONMENT || config.NODE_ENV,
  };
}

/**
 * Get upload configuration
 */
export function getUploadConfig() {
  return {
    maxSize: config.UPLOAD_MAX_SIZE,
    allowedTypes: config.UPLOAD_ALLOWED_TYPES.split(",").map((type) =>
      type.trim(),
    ),
  };
}

/**
 * Get pagination configuration
 */
export function getPaginationConfig() {
  return {
    defaultLimit: config.PAGINATION_DEFAULT_LIMIT,
    maxLimit: config.PAGINATION_MAX_LIMIT,
  };
}

/**
 * Get search configuration
 */
export function getSearchConfig() {
  return {
    debounceMs: config.SEARCH_DEBOUNCE_MS,
    minQueryLength: config.SEARCH_MIN_QUERY_LENGTH,
  };
}

/**
 * Get AI configuration
 */
export function getAIConfig() {
  return {
    apiKey: config.OPENROUTER_API_KEY,
    model: config.AI_MODEL,
    maxTokens: config.AI_MAX_TOKENS,
    temperature: config.AI_TEMPERATURE,
  };
}

/**
 * Validate configuration at runtime
 */
export function validateConfig(): { valid: boolean; errors?: string[] } {
  try {
    ConfigSchema.parse(config);
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        errors: error.errors.map(
          (err) => `${err.path.join(".")}: ${err.message}`,
        ),
      };
    }
    return {
      valid: false,
      errors: ["Unknown configuration error"],
    };
  }
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export type Config = z.infer<typeof ConfigSchema>;
export type ConfigKey = keyof Config;

// Export the schema for external validation
export { ConfigSchema };
