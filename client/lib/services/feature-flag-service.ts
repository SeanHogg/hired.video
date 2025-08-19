/**
 * Feature Flag Service
 * Handles feature flag management and evaluation
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";

// ============================================================================
// SCHEMAS
// ============================================================================

export const FeatureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  rolloutPercentage: z.number().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FeatureFlagsResponseSchema = z.object({
  flags: z.array(FeatureFlagSchema),
  userFlags: z.record(z.string(), z.boolean()),
});

// ============================================================================
// TYPES
// ============================================================================

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagsResponse = z.infer<typeof FeatureFlagsResponseSchema>;

// ============================================================================
// FEATURE FLAG SERVICE CLASS
// ============================================================================

export class FeatureFlagService {
  private flagsCache: Map<string, boolean> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all feature flags for current user
   */
  async getFeatureFlags(): Promise<FeatureFlagsResponse> {
    const response = await apiClient.get<FeatureFlagsResponse>(
      "/FeatureFlag",
      FeatureFlagsResponseSchema,
    );

    // Update cache
    this.updateCache(response.data.userFlags);

    return response.data;
  }

  /**
   * Check if a feature flag is enabled for current user
   */
  async isEnabled(flagKey: string): Promise<boolean> {
    // Check cache first
    if (this.isCacheValid() && this.flagsCache.has(flagKey)) {
      return this.flagsCache.get(flagKey) || false;
    }

    try {
      // Fetch fresh flags if cache is invalid
      const flags = await this.getFeatureFlags();
      return flags.userFlags[flagKey] || false;
    } catch (error) {
      console.warn(`Failed to fetch feature flag ${flagKey}:`, error);
      // Return cached value if available, otherwise false
      return this.flagsCache.get(flagKey) || false;
    }
  }

  /**
   * Check multiple feature flags at once
   */
  async areEnabled(flagKeys: string[]): Promise<Record<string, boolean>> {
    try {
      const flags = await this.getFeatureFlags();
      const result: Record<string, boolean> = {};

      flagKeys.forEach((key) => {
        result[key] = flags.userFlags[key] || false;
      });

      return result;
    } catch (error) {
      console.warn("Failed to fetch feature flags:", error);
      // Return cached values or false
      const result: Record<string, boolean> = {};
      flagKeys.forEach((key) => {
        result[key] = this.flagsCache.get(key) || false;
      });
      return result;
    }
  }

  /**
   * Get cached flag value (synchronous)
   */
  getCachedFlag(flagKey: string): boolean | null {
    if (this.isCacheValid() && this.flagsCache.has(flagKey)) {
      return this.flagsCache.get(flagKey) || false;
    }
    return null;
  }

  /**
   * Preload feature flags (useful for app initialization)
   */
  async preloadFlags(): Promise<void> {
    try {
      await this.getFeatureFlags();
    } catch (error) {
      console.warn("Failed to preload feature flags:", error);
    }
  }

  /**
   * Clear feature flags cache
   */
  clearCache(): void {
    this.flagsCache.clear();
    this.cacheExpiry = 0;
  }

  /**
   * Update cache with new flag values
   */
  private updateCache(userFlags: Record<string, boolean>): void {
    this.flagsCache.clear();
    Object.entries(userFlags).forEach(([key, value]) => {
      this.flagsCache.set(key, value);
    });
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    return Date.now() < this.cacheExpiry;
  }
}

// ============================================================================
// REACT HOOK FOR FEATURE FLAGS
// ============================================================================

import { useState, useEffect } from "react";

/**
 * React hook for using feature flags
 */
export function useFeatureFlag(flagKey: string): {
  isEnabled: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkFlag = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Check cache first
        const cachedValue = featureFlagService.getCachedFlag(flagKey);
        if (cachedValue !== null) {
          setIsEnabled(cachedValue);
          setIsLoading(false);
          return;
        }

        // Fetch from API
        const enabled = await featureFlagService.isEnabled(flagKey);
        if (mounted) {
          setIsEnabled(enabled);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
          setIsLoading(false);
        }
      }
    };

    checkFlag();

    return () => {
      mounted = false;
    };
  }, [flagKey]);

  return { isEnabled, isLoading, error };
}

/**
 * React hook for using multiple feature flags
 */
export function useFeatureFlags(flagKeys: string[]): {
  flags: Record<string, boolean>;
  isLoading: boolean;
  error: Error | null;
} {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkFlags = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const flagValues = await featureFlagService.areEnabled(flagKeys);
        if (mounted) {
          setFlags(flagValues);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
          setIsLoading(false);
        }
      }
    };

    checkFlags();

    return () => {
      mounted = false;
    };
  }, [flagKeys.join(",")]);

  return { flags, isLoading, error };
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const featureFlagService = new FeatureFlagService();
export default featureFlagService;
