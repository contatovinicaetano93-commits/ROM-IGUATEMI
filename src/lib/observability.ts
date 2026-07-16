import * as Sentry from '@sentry/nextjs'

export interface Observation {
  type: 'error' | 'warning' | 'info'
  category: string
  message: string
  context?: Record<string, any>
  duration_ms?: number
}

export class Observability {
  static initialize(environment: string = process.env.NODE_ENV || 'development'): void {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment,
        tracesSampleRate: 0.1,
        debug: environment === 'development',
      })
    }
  }

  static captureException(error: Error, context?: Record<string, any>): string {
    if (context) {
      Sentry.captureException(error, { contexts: { custom: context } })
    } else {
      Sentry.captureException(error)
    }
    return error.message
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    Sentry.captureMessage(message, level)
  }

  static trackMetric(name: string, value: number, unit: string = 'count'): void {
    // Custom metric tracking
    const metric = { name, value, unit, timestamp: Date.now() }
    console.debug(`[METRIC] ${name}: ${value}${unit}`)

    // Push to Sentry if available
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage(`Metric: ${name}=${value}${unit}`, 'info')
    }
  }

  static startSpan<T>(name: string, fn: (span: any) => Promise<T>): Promise<T> {
    return Sentry.startSpan({ name, op: 'operation' }, fn)
  }

  static async trackOperation<T>(
    name: string,
    fn: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      const duration = Date.now() - start
      this.trackMetric(`${name}.duration_ms`, duration, 'ms')
      this.trackMetric(`${name}.success`, 1)
      return result
    } catch (e) {
      const duration = Date.now() - start
      this.trackMetric(`${name}.duration_ms`, duration, 'ms')
      this.trackMetric(`${name}.error`, 1)
      this.captureException(e as Error, { operation: name, ...context })
      throw e
    }
  }
}

export function createPerformanceMarker(name: string): () => number {
  const start = performance.now()
  return () => {
    const duration = performance.now() - start
    Observability.trackMetric(`perf.${name}`, duration, 'ms')
    return duration
  }
}
