/** Singleflight in-process — miss concorrente compartilha a mesma Promise. */
export class RequestDeduplicator {
  private static pending = new Map<string, Promise<any>>()

  static async deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const pending = this.pending.get(key)
    if (pending) {
      return pending
    }

    const promise = fn().finally(() => {
      this.pending.delete(key)
    })

    this.pending.set(key, promise)
    return promise
  }

  static isPending(key: string): boolean {
    return this.pending.has(key)
  }

  static getPendingCount(): number {
    return this.pending.size
  }

  static clear(): void {
    this.pending.clear()
  }
}
