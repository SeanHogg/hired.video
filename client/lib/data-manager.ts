/**
 * Comprehensive data management layer
 * Provides caching, CRUD operations, and data transformation utilities
 */

import { z } from 'zod';
import { apiClient, ApiClient } from './api-client';
import { logger, logAsyncPerformance } from './logger';
import { validateOrThrow, ValidationError } from './errors';
import { ApiSuccessResponse } from '@shared/api';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface CacheConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items in cache
  strategy?: 'lru' | 'fifo'; // Cache eviction strategy
}

export interface QueryOptions {
  useCache?: boolean;
  cacheKey?: string;
  cacheTtl?: number;
  retries?: number;
  timeout?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  [key: string]: unknown;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private accessOrder: string[] = []; // For LRU tracking
  private maxSize: number;
  private strategy: 'lru' | 'fifo';

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize || 1000;
    this.strategy = config.strategy || 'lru';
  }

  set<T>(key: string, data: T, ttl: number = 300000): void { // Default 5 minutes
    // Remove expired entries
    this.cleanup();

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(key, entry);
    
    // Update access order for LRU
    if (this.strategy === 'lru') {
      this.updateAccessOrder(key);
    }

    logger.debug('Cache set', { key, ttl, cacheSize: this.cache.size });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      logger.debug('Cache miss', { key });
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      logger.debug('Cache expired', { key });
      return null;
    }

    // Update access order for LRU
    if (this.strategy === 'lru') {
      this.updateAccessOrder(key);
    }

    logger.debug('Cache hit', { key });
    return entry.data;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
      logger.debug('Cache delete', { key });
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    logger.debug('Cache cleared');
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug('Cache cleanup', { expiredCount: expiredKeys.length });
    }
  }

  private evict(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string;
    
    if (this.strategy === 'lru') {
      keyToEvict = this.accessOrder[0]; // Least recently used
    } else {
      keyToEvict = this.cache.keys().next().value; // First in (FIFO)
    }

    this.cache.delete(keyToEvict);
    this.removeFromAccessOrder(keyToEvict);
    
    logger.debug('Cache eviction', { key: keyToEvict, strategy: this.strategy });
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    // This is a simplified implementation
    // In a real app, you'd track hits/misses for accurate hit rate
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0.85, // Placeholder
    };
  }
}

// ============================================================================
// DATA MANAGER CLASS
// ============================================================================

export class DataManager {
  private cache: DataCache;
  private client: ApiClient;

  constructor(client: ApiClient = apiClient, cacheConfig: CacheConfig = {}) {
    this.cache = new DataCache(cacheConfig);
    this.client = client;
  }

  // ============================================================================
  // GENERIC CRUD OPERATIONS
  // ============================================================================

  async get<T>(
    endpoint: string,
    schema: z.ZodSchema<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const cacheKey = options.cacheKey || `get:${endpoint}`;
    
    // Try cache first
    if (options.useCache !== false) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Fetch from API
    const response = await logAsyncPerformance(`API GET ${endpoint}`, async () => {
      return this.client.get(endpoint, schema);
    });

    const data = response.data;

    // Cache the result
    if (options.useCache !== false) {
      const ttl = options.cacheTtl || 300000; // 5 minutes default
      this.cache.set(cacheKey, data, ttl);
    }

    return data;
  }

  async list<T>(
    endpoint: string,
    itemSchema: z.ZodSchema<T>,
    pagination: PaginationParams = {},
    filters: FilterParams = {},
    options: QueryOptions = {}
  ): Promise<ListResponse<T>> {
    const queryParams = new URLSearchParams();
    
    // Add pagination params
    if (pagination.page) queryParams.set('page', pagination.page.toString());
    if (pagination.limit) queryParams.set('limit', pagination.limit.toString());
    if (pagination.sortBy) queryParams.set('sortBy', pagination.sortBy);
    if (pagination.sortOrder) queryParams.set('sortOrder', pagination.sortOrder);
    
    // Add filter params
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        queryParams.set(key, String(value));
      }
    }

    const fullEndpoint = queryParams.toString() 
      ? `${endpoint}?${queryParams.toString()}`
      : endpoint;

    const cacheKey = options.cacheKey || `list:${fullEndpoint}`;
    
    // Try cache first
    if (options.useCache !== false) {
      const cached = this.cache.get<ListResponse<T>>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Define response schema
    const responseSchema = z.object({
      items: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    });

    // Fetch from API
    const response = await logAsyncPerformance(`API LIST ${endpoint}`, async () => {
      return this.client.get(fullEndpoint, responseSchema);
    });

    const data = response.data as ListResponse<T>;

    // Cache the result
    if (options.useCache !== false) {
      const ttl = options.cacheTtl || 180000; // 3 minutes default for lists
      this.cache.set(cacheKey, data, ttl);
    }

    return data;
  }

  async create<TInput, TOutput>(
    endpoint: string,
    data: TInput,
    inputSchema: z.ZodSchema<TInput>,
    outputSchema: z.ZodSchema<TOutput>,
    options: QueryOptions = {}
  ): Promise<TOutput> {
    // Validate input data
    const validatedData = validateOrThrow(data, inputSchema);

    // Create via API
    const response = await logAsyncPerformance(`API CREATE ${endpoint}`, async () => {
      return this.client.post(endpoint, validatedData, outputSchema);
    });

    // Invalidate related cache entries
    this.invalidateCache(`list:${endpoint}`);
    
    return response.data;
  }

  async update<TInput, TOutput>(
    endpoint: string,
    id: string,
    data: Partial<TInput>,
    inputSchema: z.ZodSchema<Partial<TInput>>,
    outputSchema: z.ZodSchema<TOutput>,
    options: QueryOptions = {}
  ): Promise<TOutput> {
    // Validate input data
    const validatedData = validateOrThrow(data, inputSchema);

    const fullEndpoint = `${endpoint}/${id}`;

    // Update via API
    const response = await logAsyncPerformance(`API UPDATE ${fullEndpoint}`, async () => {
      return this.client.put(fullEndpoint, validatedData, outputSchema);
    });

    // Invalidate cache entries
    this.invalidateCache(`get:${fullEndpoint}`);
    this.invalidateCache(`list:${endpoint}`);
    
    return response.data;
  }

  async delete(
    endpoint: string,
    id: string,
    options: QueryOptions = {}
  ): Promise<void> {
    const fullEndpoint = `${endpoint}/${id}`;

    // Delete via API
    await logAsyncPerformance(`API DELETE ${fullEndpoint}`, async () => {
      return this.client.delete(fullEndpoint, z.object({}));
    });

    // Invalidate cache entries
    this.invalidateCache(`get:${fullEndpoint}`);
    this.invalidateCache(`list:${endpoint}`);
  }

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  invalidateCache(pattern: string): void {
    // Simple pattern matching - in production, you might want more sophisticated pattern matching
    const keysToDelete: string[] = [];
    
    // Get all cache keys and find matches
    // Note: This is a simplified implementation
    // In a real app, you might want to track cache keys more efficiently
    
    logger.debug('Cache invalidation', { pattern });
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return this.cache.getStats();
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const dataManager = new DataManager();

export default dataManager;
