// Interface de mensageria — trocar de provedor (Evolution API -> WhatsApp Cloud API oficial)
// no futuro é implementar essa interface de novo, sem tocar no resto do sistema.
export interface WhatsAppAdapter {
  sendMessage(to: string, text: string): Promise<void>
}

export class EvolutionApiAdapter implements WhatsAppAdapter {
  private baseUrl: string
  private apiKey: string
  private instance: string

  constructor() {
    const baseUrl = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    const instance = process.env.EVOLUTION_API_INSTANCE

    if (!baseUrl || !apiKey || !instance) {
      throw new Error(
        'EVOLUTION_API_URL, EVOLUTION_API_KEY ou EVOLUTION_API_INSTANCE não configurados'
      )
    }

    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.instance = instance
  }

  async sendMessage(to: string, text: string): Promise<void> {
    // Evolution API espera só dígitos (ex: 5511999998888) — número com "+" é aceito
    // sem erro pela API mas a mensagem não é entregue de verdade.
    const number = to.replace(/\D/g, '')
    const res = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify({ number, text }),
    })

    if (!res.ok) {
      throw new Error(`Evolution API respondeu ${res.status}: ${await res.text()}`)
    }
  }
}

export function getWhatsAppAdapter(): WhatsAppAdapter {
  return new EvolutionApiAdapter()
}
