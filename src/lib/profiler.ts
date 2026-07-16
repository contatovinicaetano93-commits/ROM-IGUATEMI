export interface PerformanceMetric {
  name: string
  duration_ms: number
  timestamp: string
  context?: Record<string, any>
}

export class Profiler {
  private static metrics: PerformanceMetric[] = []
  private static maxMetrics = 10000

  static mark(name: string, duration_ms: number, context?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      duration_ms,
      timestamp: new Date().toISOString(),
      context,
    }

    this.metrics.push(metric)

    // Evict old metrics if exceeding max
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log if slow
    if (duration_ms > 1000) {
      console.warn(`[SLOW] ${name}: ${duration_ms}ms`, context)
    }
  }

  static async measure<T>(name: string, fn: () => Promise<T>, context?: Record<string, any>): Promise<T> {
    const start = performance.now()
    try {
      return await fn()
    } finally {
      const duration = performance.now() - start
      this.mark(name, Math.round(duration), context)
    }
  }

  static getMetrics(name?: string): PerformanceMetric[] {
    if (!name) return this.metrics

    return this.metrics.filter((m) => m.name === name)
  }

  static getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const metrics = this.getMetrics(name)
    if (metrics.length === 0) return null

    const durations = metrics.map((m) => m.duration_ms)
    const sum = durations.reduce((a, b) => a + b, 0)

    return {
      avg: Math.round(sum / durations.length),
      min: Math.min(...durations),
      max: Math.max(...durations),
      count: durations.length,
    }
  }

  static getSlowOperations(thresholdMs: number = 1000): PerformanceMetric[] {
    return this.metrics.filter((m) => m.duration_ms > thresholdMs)
  }

  static report(): Record<string, any> {
    const allNames = [...new Set(this.metrics.map((m) => m.name))]

    return Object.fromEntries(
      allNames.map((name) => [name, this.getStats(name)]).filter(([, stats]) => stats !== null),
    )
  }

  static clear(): void {
    this.metrics = []
  }
}

export function createProfiledFunction<T extends any[], R>(
  name: string,
  fn: (...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    return Profiler.measure(name, () => fn(...args))
  }
}
