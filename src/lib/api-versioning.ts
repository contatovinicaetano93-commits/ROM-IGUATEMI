export const API_VERSIONS = {
  V1: '1.0.0',
  V2: '2.0.0',
  CURRENT: '2.0.0',
} as const

export class ApiVersioning {
  static parseVersion(header?: string): string {
    if (!header) return API_VERSIONS.CURRENT

    // Support: 'application/json; version=2.0.0' or just '2.0.0'
    const match = header.match(/version=([0-9.]+)/)
    if (match) return match[1]

    return API_VERSIONS.CURRENT
  }

  static isVersionSupported(version: string): boolean {
    return version === API_VERSIONS.V1 || version === API_VERSIONS.V2
  }

  static transformResponse(version: string, data: any, endpoint: string): any {
    if (version === API_VERSIONS.V1) {
      return this.transformToV1(endpoint, data)
    }
    return data
  }

  private static transformToV1(endpoint: string, data: any): any {
    // Example transformations for backward compatibility
    if (endpoint === '/api/estoque/produtos' && Array.isArray(data)) {
      return data.map((p) => ({
        ...p,
        // V1 used 'stock_quantity' instead of 'current_qty'
        stock_quantity: p.current_qty,
      }))
    }
    return data
  }

  static getDeprecationWarning(version: string): string | null {
    if (version === API_VERSIONS.V1) {
      return 'API v1 is deprecated and will be removed on 2026-12-31. Please migrate to v2.'
    }
    return null
  }
}

export function getApiVersion(req: Request): string {
  const acceptHeader = req.headers.get('accept')
  return ApiVersioning.parseVersion(acceptHeader || undefined)
}
