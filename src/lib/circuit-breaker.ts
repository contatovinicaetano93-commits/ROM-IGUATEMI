export class CircuitBreaker {
  private static activeJobs = new Map<string, number>()
  private static maxConcurrent = 1

  static isRunning(jobKey: string): boolean {
    return (this.activeJobs.get(jobKey) ?? 0) > 0
  }

  static getStatus(jobKey: string): { running: boolean; count: number } {
    const count = this.activeJobs.get(jobKey) ?? 0
    return { running: count > 0, count }
  }

  static async execute<T>(
    jobKey: string,
    fn: () => Promise<T>,
    options?: { maxConcurrent?: number; timeoutMs?: number },
  ): Promise<T> {
    const max = options?.maxConcurrent ?? this.maxConcurrent
    const current = this.activeJobs.get(jobKey) ?? 0

    if (current >= max) {
      throw new Error(
        `Job "${jobKey}" is already running (${current}/${max} slots in use). Please wait and retry.`,
      )
    }

    this.activeJobs.set(jobKey, current + 1)

    try {
      const timeoutMs = options?.timeoutMs ?? 300000 // 5min default
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Job "${jobKey}" timeout after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ])
    } finally {
      const newCount = (this.activeJobs.get(jobKey) ?? 1) - 1
      if (newCount <= 0) {
        this.activeJobs.delete(jobKey)
      } else {
        this.activeJobs.set(jobKey, newCount)
      }
    }
  }

  static reset(jobKey?: string): void {
    if (jobKey) {
      this.activeJobs.delete(jobKey)
    } else {
      this.activeJobs.clear()
    }
  }
}
