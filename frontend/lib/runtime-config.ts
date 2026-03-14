/**
 * Runtime configuration system for static deployments
 * Reads configuration from window.APP_CONFIG (loaded from /config.js)
 * Falls back to build-time environment variables if runtime config is not available
 */

interface AppConfig {
  API_URL: string;
  ERROR_REPORTING: {
    ENABLED: boolean;
    DSN: string;
    ENVIRONMENT: string;
    SAMPLE_RATE: number;
  };
  FEATURES: {
    AI_CHAT: boolean;
    VIDEO_RESUMES: boolean;
    ANALYTICS: boolean;
    NOTIFICATIONS: boolean;
  };
  PERFORMANCE: {
    MONITORING: boolean;
    SAMPLE_RATE: number;
  };
  LOGGING: {
    LEVEL: string;
    MAX_ENTRIES: number;
  };
  VERSION: string;

}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

class RuntimeConfig {
  private config: AppConfig;

  constructor() {
    // Try to load from runtime config first, then fall back to build-time env vars
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    // Runtime config from /config.js (preferred for static deployments)
    if (typeof window !== "undefined" && window.APP_CONFIG) {
      console.log("Using runtime configuration from /config.js");
      return window.APP_CONFIG;
    }

    // Fallback to build-time environment variables (for development)
    console.log("Using build-time environment variables");
    return {
      API_URL: import.meta.env.VITE_API_URL || "https://api.hired.video/api",
      ERROR_REPORTING: {
        ENABLED: import.meta.env.VITE_ERROR_REPORTING_ENABLED === "true",
        DSN: import.meta.env.VITE_ERROR_REPORTING_DSN || "",
        ENVIRONMENT: import.meta.env.VITE_ERROR_REPORTING_ENVIRONMENT || "development",
        SAMPLE_RATE: parseFloat(import.meta.env.VITE_ERROR_REPORTING_SAMPLE_RATE || "0.1"),
      },
      FEATURES: {
        AI_CHAT: import.meta.env.VITE_FEATURE_AI_CHAT !== "false",
        VIDEO_RESUMES: import.meta.env.VITE_FEATURE_VIDEO_RESUMES !== "false",
        ANALYTICS: import.meta.env.VITE_FEATURE_ANALYTICS === "true",
        NOTIFICATIONS: import.meta.env.VITE_FEATURE_NOTIFICATIONS !== "false",
      },
      PERFORMANCE: {
        MONITORING: import.meta.env.VITE_PERFORMANCE_MONITORING === "true",
        SAMPLE_RATE: parseFloat(import.meta.env.VITE_PERFORMANCE_SAMPLE_RATE || "0.1"),
      },
      LOGGING: {
        LEVEL: import.meta.env.VITE_LOG_LEVEL || "info",
        MAX_ENTRIES: parseInt(import.meta.env.VITE_LOG_MAX_ENTRIES || "100"),
      },
      VERSION: import.meta.env.VITE_APP_VERSION || "unknown",

    };
  }

  // Getters for easy access
  get apiUrl(): string {
    return this.config.API_URL;
  }

  get errorReporting() {
    return this.config.ERROR_REPORTING;
  }

  get features() {
    return this.config.FEATURES;
  }

  get performance() {
    return this.config.PERFORMANCE;
  }

  get logging() {
    return this.config.LOGGING;
  }

  get version(): string {
    return this.config.VERSION;
  }



  get isProduction(): boolean {
    return this.config.ERROR_REPORTING.ENVIRONMENT === "production";
  }

  get isDevelopment(): boolean {
    return this.config.ERROR_REPORTING.ENVIRONMENT === "development";
  }

  // Method to update config at runtime (useful for admin panels)
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Also update the global config if it exists
    if (typeof window !== "undefined" && window.APP_CONFIG) {
      window.APP_CONFIG = { ...window.APP_CONFIG, ...updates };
    }
  }

  // Get the full config object
  getConfig(): AppConfig {
    return { ...this.config };
  }

  // Debug method to log current configuration
  logConfig(): void {
    console.group("🔧 Runtime Configuration");
    console.log("API URL:", this.apiUrl);
    console.log("Environment:", this.errorReporting.ENVIRONMENT);
    console.log("Error Reporting:", this.errorReporting.ENABLED ? "Enabled" : "Disabled");
    console.log("Version:", this.version);
    console.log("Features:", this.features);
    console.groupEnd();
  }
}

// Create singleton instance
export const runtimeConfig = new RuntimeConfig();

// Export for backward compatibility with existing code
export const isProduction = runtimeConfig.isProduction;
export const isDevelopment = runtimeConfig.isDevelopment;

// Export the class for testing
export { RuntimeConfig };
export type { AppConfig };