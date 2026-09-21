/**
 * WhatsApp do RH — botão flutuante da intranet.
 * Override por unidade: NEXT_PUBLIC_RH_WHATSAPP_NUMBER na Vercel.
 */
export const RH_WHATSAPP_DEFAULT = '11993455589'

export const RH_WHATSAPP_PREFILL =
  'Olá! Sou da equipe ROM e preciso de ajuda do RH.'

export function getRhWhatsAppNumber(): string {
  const fromEnv = process.env.NEXT_PUBLIC_RH_WHATSAPP_NUMBER?.trim()
  return fromEnv || RH_WHATSAPP_DEFAULT
}
