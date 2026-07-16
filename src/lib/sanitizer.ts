export class Sanitizer {
  static string(value: string, maxLength: number = 1000): string {
    if (typeof value !== 'string') return ''

    return value
      .trim()
      .slice(0, maxLength)
      .replace(/[<>\"']/g, (char) => {
        const map: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
        }
        return map[char]
      })
  }

  static email(value: string): string {
    const email = this.string(value, 254)
    return email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? email : ''
  }

  static number(value: any): number {
    const num = Number(value)
    return isNaN(num) ? 0 : num
  }

  static boolean(value: any): boolean {
    return value === true || value === 'true' || value === 1 || value === '1'
  }

  static slug(value: string): string {
    return this.string(value, 100)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
  }

  static json(value: any): Record<string, any> {
    if (typeof value === 'object' && value !== null) {
      return value
    }
    try {
      return JSON.parse(String(value))
    } catch {
      return {}
    }
  }

  static sanitizeObject<T extends Record<string, any>>(obj: T, schema: Record<keyof T, (v: any) => any>): Partial<T> {
    const result: Partial<T> = {}

    for (const [key, sanitizer] of Object.entries(schema)) {
      if (key in obj) {
        result[key as keyof T] = sanitizer(obj[key])
      }
    }

    return result
  }
}
