export class QueryOptimizer {
  static async checkNPlusOne(
    name: string,
    parentCount: number,
    queryCount: number,
    threshold: number = parentCount * 1.5,
  ): Promise<{ isOptimal: boolean; warning?: string }> {
    if (queryCount > threshold) {
      return {
        isOptimal: false,
        warning: `N+1 detected in ${name}: ${parentCount} parents triggered ${queryCount} queries (expected ~${Math.ceil(parentCount * 1.1)})`,
      }
    }

    return { isOptimal: true }
  }

  static suggestIndex(
    tableName: string,
    columns: string[],
    filterFrequency: number, // 0-100
  ): { shouldIndex: boolean; reason: string } {
    if (filterFrequency < 20) {
      return { shouldIndex: false, reason: 'Low filter frequency' }
    }

    return {
      shouldIndex: true,
      reason: `HIGH usage (${filterFrequency}%) - consider: CREATE INDEX idx_${tableName}_${columns.join('_')} ON ${tableName}(${columns.join(', ')})`,
    }
  }

  static estimateQueryComplexity(
    joins: number,
    conditions: number,
    aggregations: number,
  ): 'simple' | 'moderate' | 'complex' {
    const score = joins * 2 + conditions * 1 + aggregations * 3
    if (score <= 3) return 'simple'
    if (score <= 8) return 'moderate'
    return 'complex'
  }
}

export interface QueryStats {
  name: string
  count: number
  total_ms: number
  avg_ms: number
  slow_count: number
}

export class QueryCache {
  private static cache = new Map<string, { result: any; expiresAt: number }>()
  private static stats = new Map<string, QueryStats>()

  static async executeWithCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T> {
    const cached = this.cache.get(key)
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result
    }

    const start = Date.now()
    const result = await fn()
    const duration = Date.now() - start

    this.cache.set(key, { result, expiresAt: Date.now() + ttlSeconds * 1000 })
    this.recordStat(key, duration)

    return result
  }

  private static recordStat(name: string, duration_ms: number): void {
    const current = this.stats.get(name) || {
      name,
      count: 0,
      total_ms: 0,
      avg_ms: 0,
      slow_count: 0,
    }

    current.count++
    current.total_ms += duration_ms
    current.avg_ms = current.total_ms / current.count
    if (duration_ms > 1000) current.slow_count++

    this.stats.set(name, current)
  }

  static getStats(name?: string): QueryStats[] {
    if (name) {
      const stat = this.stats.get(name)
      return stat ? [stat] : []
    }
    return Array.from(this.stats.values())
  }

  static clear(): void {
    this.cache.clear()
    this.stats.clear()
  }
}
