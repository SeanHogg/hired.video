/**
 * Application-wide constants
 * Centralized location for all constant values used across the application
 */

// ============================================================================
// SYSTEM HEALTH
// ============================================================================

/**
 * Default uptime percentage displayed when no actual metrics are available
 * This value should match the backend SystemHealth:DefaultUptimePercentage configuration
 */
export const DEFAULT_UPTIME_PERCENTAGE = 99.8;

/**
 * Minimum uptime threshold to consider the system "healthy"
 */
export const HEALTHY_UPTIME_THRESHOLD = 95.0;

/**
 * Maximum error rate percentage to consider the system "healthy"
 */
export const MAX_ERROR_RATE_PERCENTAGE = 1.0;

// ============================================================================
// TRUST SIGNALS
// ============================================================================

/**
 * Trust signals displayed on marketing pages
 */
export const TRUST_SIGNALS = {
  SECURITY: "Enterprise Security",
  SUPPORT: "24/7 Support",
  RATING: "Highly Rated",
} as const;

// ============================================================================
// PRICING
// ============================================================================

/**
 * Pricing-related constants
 */
export const PRICING = {
  ANNUAL_DISCOUNT_PERCENTAGE: 20,
  AFFILIATE_COMMISSION_PERCENTAGE: 25,
  MINIMUM_PAYOUT_DOLLARS: 25.0,
} as const;

