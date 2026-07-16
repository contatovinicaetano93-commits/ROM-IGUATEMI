export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  error?: { message: string; stack?: string }
  duration_ms?: number
}

export class Logger {
  private static isDev = process.env.NODE_ENV === 'development'
  private static isProduction = process.env.NODE_ENV === 'production'

  private static formatEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, error, duration_ms } = entry
    const parts = [
      `[${timestamp}]`,
      `[${level.toUpperCase()}]`,
      message,
    ]

    if (context && Object.keys(context).length > 0) {
      parts.push(`context=${JSON.stringify(context)}`)
    }

    if (duration_ms) {
      parts.push(`duration=${duration_ms}ms`)
    }

    if (error) {
      parts.push(`error=${error.message}`)
      if (this.isDev && error.stack) {
        parts.push(`stack=${error.stack}`)
      }
    }

    return parts.join(' ')
  }

  private static log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error, duration_ms?: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      duration_ms,
      error: error ? { message: error.message, stack: error.stack } : undefined,
    }

    const formatted = this.formatEntry(entry)

    switch (level) {
      case 'debug':
        if (this.isDev) console.debug(formatted)
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted)
        break
    }

    // Send to external logging service in production
    if (this.isProduction && level === 'error') {
      this.sendToExternalLogger(entry).catch(console.error)
    }
  }

  static debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context)
  }

  static info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context)
  }

  static warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context)
  }

  static error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log('error', message, context, error)
  }

  static async operation<T>(
    name: string,
    fn: () => Promise<T>,
    context?: Record<string, any>,
  ): Promise<T> {
    const start = Date.now()
    this.info(`Starting: ${name}`, context)

    try {
      const result = await fn()
      const duration = Date.now() - start
      this.info(`Completed: ${name}`, { ...context, duration_ms: duration })
      return result
    } catch (e) {
      const duration = Date.now() - start
      this.error(`Failed: ${name}`, e as Error, { ...context, duration_ms: duration })
      throw e
    }
  }

  private static async sendToExternalLogger(entry: LogEntry): Promise<void> {
    if (process.env.LOGGER_WEBHOOK_URL) {
      try {
        await fetch(process.env.LOGGER_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
      } catch {
        // Silently fail to avoid logging recursion
      }
    }
  }
}
