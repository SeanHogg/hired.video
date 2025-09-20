// Runtime configuration for static deployment
// This file can be modified after deployment without rebuilding
window.APP_CONFIG = {
  // API Configuration
  API_URL: "https://api.myvideoresu.me/api",

  // Error Tracking (GlitchTip/Sentry)
  ERROR_REPORTING: {
    ENABLED: true,
    DSN: "https://43cf169b17fc4c1780849f0dd708ef39@app.glitchtip.com/12926",
    ENVIRONMENT: "production", // development, staging, production
    SAMPLE_RATE: 0.1, // 10% of transactions for performance monitoring
  },

  // Feature Flags
  FEATURES: {
    AI_CHAT: true,
    VIDEO_RESUMES: true,
    ANALYTICS: false,
    NOTIFICATIONS: true,
  },

  // Performance Monitoring
  PERFORMANCE: {
    MONITORING: false,
    SAMPLE_RATE: 0.1,
  },

  // Logging
  LOGGING: {
    LEVEL: "info", // debug, info, warn, error
    MAX_ENTRIES: 100,
  },

  // App Version (update this with each deployment)
  VERSION: "1.2.0",


};