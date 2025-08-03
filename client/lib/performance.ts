/**
 * Performance monitoring and optimization utilities
 */

import { config, getPerformanceConfig } from './config';
import { logger } from './logger';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count';
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface WebVitalsMetric {
  name: 'CLS' | 'FID' | 'FCP' | 'LCP' | 'TTFB';
  value: number;
  delta: number;
  id: string;
  navigationType: string;
}

export interface ResourceTiming {
  name: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  startTime: number;
  responseEnd: number;
}

// ============================================================================
// PERFORMANCE MONITOR CLASS
// ============================================================================

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private observers: PerformanceObserver[] = [];
  private config = getPerformanceConfig();

  constructor() {
    if (this.config.enabled && typeof window !== 'undefined') {
      this.initializeObservers();
      this.trackWebVitals();
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeObservers(): void {
    // Navigation timing observer
    if ('PerformanceObserver' in window) {
      try {
        const navigationObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handleNavigationEntry(entry as PerformanceNavigationTiming);
          }
        });
        navigationObserver.observe({ entryTypes: ['navigation'] });
        this.observers.push(navigationObserver);
      } catch (error) {
        logger.warn('Failed to initialize navigation observer', { error });
      }

      // Resource timing observer
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handleResourceEntry(entry as PerformanceResourceTiming);
          }
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
      } catch (error) {
        logger.warn('Failed to initialize resource observer', { error });
      }

      // Long task observer
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handleLongTaskEntry(entry);
          }
        });
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        this.observers.push(longTaskObserver);
      } catch (error) {
        logger.warn('Failed to initialize long task observer', { error });
      }
    }
  }

  private trackWebVitals(): void {
    // Import web-vitals dynamically to avoid bundle size impact
    import('web-vitals').then((webVitals) => {
      if (webVitals.onCLS) webVitals.onCLS(this.handleWebVital.bind(this));
      if (webVitals.onINP) webVitals.onINP(this.handleWebVital.bind(this));
      if (webVitals.onFCP) webVitals.onFCP(this.handleWebVital.bind(this));
      if (webVitals.onLCP) webVitals.onLCP(this.handleWebVital.bind(this));
      if (webVitals.onTTFB) webVitals.onTTFB(this.handleWebVital.bind(this));
    }).catch((error) => {
      logger.warn('Failed to load web-vitals library', { error });
    });
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private handleNavigationEntry(entry: PerformanceNavigationTiming): void {
    const metrics: PerformanceMetric[] = [
      {
        name: 'navigation.domContentLoaded',
        value: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
        unit: 'ms',
        timestamp: Date.now(),
      },
      {
        name: 'navigation.loadComplete',
        value: entry.loadEventEnd - entry.loadEventStart,
        unit: 'ms',
        timestamp: Date.now(),
      },
      {
        name: 'navigation.domInteractive',
        value: entry.domInteractive - entry.fetchStart,
        unit: 'ms',
        timestamp: Date.now(),
      },
      {
        name: 'navigation.domComplete',
        value: entry.domComplete - entry.fetchStart,
        unit: 'ms',
        timestamp: Date.now(),
      },
    ];

    metrics.forEach(metric => this.recordMetric(metric));
  }

  private handleResourceEntry(entry: PerformanceResourceTiming): void {
    // Only track significant resources
    if (entry.transferSize > 10000 || entry.duration > 100) {
      const resourceTiming: ResourceTiming = {
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
      };

      this.recordMetric({
        name: 'resource.load',
        value: entry.duration,
        unit: 'ms',
        timestamp: Date.now(),
        context: resourceTiming as unknown as Record<string, unknown>,
      });
    }
  }

  private handleLongTaskEntry(entry: PerformanceEntry): void {
    this.recordMetric({
      name: 'longtask.duration',
      value: entry.duration,
      unit: 'ms',
      timestamp: Date.now(),
      context: {
        startTime: entry.startTime,
        name: entry.name,
      },
    });

    // Log warning for very long tasks
    if (entry.duration > 100) {
      logger.warn('Long task detected', {
        duration: entry.duration,
        startTime: entry.startTime,
      });
    }
  }

  private handleWebVital(metric: WebVitalsMetric): void {
    this.recordMetric({
      name: `webvital.${metric.name.toLowerCase()}`,
      value: metric.value,
      unit: 'ms',
      timestamp: Date.now(),
      context: {
        delta: metric.delta,
        id: metric.id,
        navigationType: metric.navigationType,
      },
    });

    // Log poor web vitals
    const thresholds = {
      CLS: 0.1,
      FID: 100,
      FCP: 1800,
      LCP: 2500,
      TTFB: 800,
    };

    if (metric.value > thresholds[metric.name]) {
      logger.warn(`Poor ${metric.name} detected`, {
        value: metric.value,
        threshold: thresholds[metric.name],
      });
    }
  }

  // ============================================================================
  // METRIC RECORDING
  // ============================================================================

  recordMetric(metric: PerformanceMetric): void {
    if (!this.shouldSample()) {
      return;
    }

    this.metrics.push(metric);

    // Log performance metrics
    logger.debug('Performance metric recorded', metric as unknown as Record<string, unknown>);

    // Keep only recent metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }

    // Send to external monitoring service if configured
    this.sendToMonitoringService(metric);
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  private sendToMonitoringService(metric: PerformanceMetric): void {
    // TODO: Integrate with external monitoring service
    // Example: DataDog, New Relic, etc.
    
    // For now, just log to console in development
    if (config.NODE_ENV === 'development') {
      console.debug('Performance metric:', metric);
    }
  }

  // ============================================================================
  // MANUAL TIMING
  // ============================================================================

  startTiming(name: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric({
        name: `timing.${name}`,
        value: duration,
        unit: 'ms',
        timestamp: Date.now(),
      });
    };
  }

  measureFunction<T extends (...args: any[]) => any>(
    name: string,
    fn: T
  ): T {
    return ((...args: Parameters<T>) => {
      const endTiming = this.startTiming(name);
      try {
        const result = fn(...args);
        
        // Handle async functions
        if (result instanceof Promise) {
          return result.finally(endTiming);
        }
        
        endTiming();
        return result;
      } catch (error) {
        endTiming();
        throw error;
      }
    }) as T;
  }

  measureAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T
  ): T {
    return (async (...args: Parameters<T>) => {
      const endTiming = this.startTiming(name);
      try {
        const result = await fn(...args);
        endTiming();
        return result;
      } catch (error) {
        endTiming();
        throw error;
      }
    }) as T;
  }

  // ============================================================================
  // MEMORY MONITORING
  // ============================================================================

  recordMemoryUsage(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      
      this.recordMetric({
        name: 'memory.used',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
        context: {
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
        },
      });
    }
  }

  // ============================================================================
  // REPORTING
  // ============================================================================

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(metric => metric.name === name);
  }

  getAverageMetric(name: string): number | null {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return null;
    
    const sum = metrics.reduce((acc, metric) => acc + metric.value, 0);
    return sum / metrics.length;
  }

  clearMetrics(): void {
    this.metrics = [];
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.clearMetrics();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const performanceMonitor = new PerformanceMonitor();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Measure the performance of a function
 */
export function measure<T extends (...args: any[]) => any>(name: string, fn: T): T {
  return performanceMonitor.measureFunction(name, fn);
}

/**
 * Measure the performance of an async function
 */
export function measureAsync<T extends (...args: any[]) => Promise<any>>(name: string, fn: T): T {
  return performanceMonitor.measureAsyncFunction(name, fn);
}

/**
 * Start a manual timing measurement
 */
export function startTiming(name: string): () => void {
  return performanceMonitor.startTiming(name);
}

/**
 * Record memory usage
 */
export function recordMemoryUsage(): void {
  performanceMonitor.recordMemoryUsage();
}

/**
 * Get performance metrics
 */
export function getPerformanceMetrics(): PerformanceMetric[] {
  return performanceMonitor.getMetrics();
}

export default performanceMonitor;
