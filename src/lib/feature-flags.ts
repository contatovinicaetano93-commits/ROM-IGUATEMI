export interface FeatureFlag {
  name: string
  enabled: boolean
  percentage?: number // 0-100 for gradual rollout
  allowedRoles?: string[]
}

export class FeatureFlags {
  private static flags = new Map<string, FeatureFlag>()

  static register(flag: FeatureFlag): void {
    this.flags.set(flag.name, flag)
  }

  static registerBatch(flags: FeatureFlag[]): void {
    flags.forEach((flag) => this.register(flag))
  }

  static isEnabled(name: string, userId?: string, role?: string): boolean {
    const flag = this.flags.get(name)
    if (!flag) return false
    if (!flag.enabled) return false

    // Check role-based access
    if (flag.allowedRoles && role && !flag.allowedRoles.includes(role)) {
      return false
    }

    // Check percentage rollout
    if (flag.percentage !== undefined && flag.percentage < 100) {
      if (!userId) return false
      const hash = this.hashUserId(userId, name)
      return hash < flag.percentage
    }

    return true
  }

  static getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name)
  }

  static list(): FeatureFlag[] {
    return Array.from(this.flags.values())
  }

  private static hashUserId(userId: string, flagName: string): number {
    const combined = `${userId}:${flagName}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash) + combined.charCodeAt(i)
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100
  }
}

// Default flags
FeatureFlags.registerBatch([
  { name: 'estoque_module', enabled: true },
  { name: 'health_alerts', enabled: true, allowedRoles: ['admin', 'financeiro'] },
  { name: 'api_docs', enabled: true, percentage: 50 }, // 50% rollout
  { name: 'new_dashboard', enabled: false }, // Disabled by default
])
