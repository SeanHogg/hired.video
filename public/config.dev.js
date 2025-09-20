// Runtime configuration for development
// Copy this to config.js for local development with different settings
window.APP_CONFIG = {
  // API Configuration
  API_URL: "http://localhost:5000/api", // Local development API
  
  // Error Tracking (GlitchTip/Sentry)
  ERROR_REPORTING: {
    ENABLED: true,
    DSN: "https://43cf169b17fc4c1780849f0dd708ef39@app.glitchtip.com/12926",
    ENVIRONMENT: "development",
    SAMPLE_RATE: 1.0, // 100% sampling in development
  },
  
  // Feature Flags
  FEATURES: {
    AI_CHAT: true,
    VIDEO_RESUMES: true,
    ANALYTICS: true, // Enable analytics in development for testing
    NOTIFICATIONS: true,
  },
  
  // Performance Monitoring
  PERFORMANCE: {
    MONITORING: true, // Enable in development for debugging
    SAMPLE_RATE: 1.0, // 100% sampling in development
  },
  
  // Logging
  LOGGING: {
    LEVEL: "debug", // Verbose logging in development
    MAX_ENTRIES: 200,
  },
  
  // App Version
  VERSION: "1.2.0-dev",
  
  // Build timestamp
  BUILD_TIME: new Date().toISOString(),
};