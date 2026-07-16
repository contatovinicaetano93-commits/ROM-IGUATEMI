export class RequestDeduplicator {
  private static pending = new Map<string, Promise<any>>()

  static async deduplicate<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // If already pending, wait for it
    const pending = this.pending.get(key)
    if (pending) {
      return pending
    }

    // Execute and cache the promise
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

// Usage example:
// POST /api/estoque/sync would deduplicate by:
// const result = await RequestDeduplicator.deduplicate('estoque_sync_fast', () => runStockSync('fast'))
