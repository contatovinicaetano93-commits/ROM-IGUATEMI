import { defaultProductionHost } from '@/lib/deployment'

export interface SetupItem {
  id: string
  label: string
  envVars: string[]
  priority: 'agora' | 'quando_tiver' | 'opcional'
  steps: string[]
  link?: { href: string; label: string }
}

export const SETUP_ITEMS: SetupItem[] = [
  {
    id: 'panel',
    label: 'Painel / unidade (Vercel)',
    envVars: ['ROM_PANEL', 'NEXT_PUBLIC_ROM_PANEL', 'DATABASE_URL'],
    priority: 'agora',
    steps: [
      'Use DOIS projetos Vercel (Brasil e Iguatemi) — nunca um banco compartilhado',
      'ROM_PANEL e NEXT_PUBLIC_ROM_PANEL com o MESMO valor (brasil ou iguatemi)',
      'DATABASE_URL = Neon dedicado só desta unidade',
      'Redeploy após alterar NEXT_PUBLIC_ROM_PANEL (valor vai no build)',
      'Admin → Diagnóstico: confira deployment.display_name e validation.warnings',
    ],
  },
  {
    id: 'auth',
    label: 'Login do painel (admin + funcionário)',
    envVars: ['ROM_ADMIN_USER', 'ROM_ADMIN_PASSWORD', 'ROM_STAFF_USER', 'ROM_STAFF_PASSWORD'],
    priority: 'agora',
    steps: [
      'Vercel → Settings → Environment Variables',
      'Admin: ROM_ADMIN_USER + ROM_ADMIN_PASSWORD (vê faturamento)',
      'Funcionário: ROM_STAFF_USER + ROM_STAFF_PASSWORD (painel sem faturamento)',
      'Brasil seed: ADMIN-BRASIL / FUNC-BRASIL',
      'Protege hoje, dashboard, contatos e APIs internas',
      'Redeploy do projeto',
    ],
  },
  {
    id: 'cron',
    label: 'CRON_SECRET (backup sync)',
    envVars: ['CRON_SECRET'],
    priority: 'agora',
    steps: [
      'Gere um segredo: openssl rand -hex 32',
      'Vercel → CRON_SECRET = o valor gerado',
      'Protege sync cron (fast 5 min + full 10 min) e disparo manual/webhook',
      'Tempo real = webhook Avec (AVEC_WEBHOOK_SECRET) — cron é rede de segurança',
      'Redeploy',
    ],
  },
  {
    id: 'avec_webhook',
    label: 'Webhook Avec (tempo real)',
    envVars: ['AVEC_WEBHOOK_SECRET'],
    priority: 'agora',
    steps: [
      'Gere: openssl rand -hex 32',
      'Vercel → AVEC_WEBHOOK_SECRET = o valor gerado → Redeploy',
      `URL: https://${defaultProductionHost()}/api/webhooks/avec`,
      'Header: x-avec-secret = mesmo valor do AVEC_WEBHOOK_SECRET',
      'Peça ao suporte Avec (ou use Zapier/Make) para POST em cada agendamento/atendimento',
      'Eventos: appointment.created, appointment.updated, service.completed, client.upsert',
      'Admin → Diagnóstico mostra se o secret está configurado',
    ],
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    envVars: ['ANTHROPIC_API_KEY'],
    priority: 'quando_tiver',
    steps: [
      'Crie conta em console.anthropic.com',
      'API Keys → Create Key',
      'Vercel → ANTHROPIC_API_KEY = sk-ant-...',
      'Ativa: briefings IA, WhatsApp bot e Telegram secretária',
    ],
    link: { href: 'https://console.anthropic.com/settings/keys', label: 'Anthropic API Keys' },
  },
  {
    id: 'avec',
    label: 'Avec token',
    envVars: ['AVEC_API_TOKEN'],
    priority: 'quando_tiver',
    steps: [
      'Pedir token ao suporte Avec (relatórios 0004, 0051, 0002) — um token por unidade',
      'Vercel → AVEC_API_TOKEN = token recebido (sem Bearer)',
      'Opcional: AVEC_SYNC_MAX_PAGES (padrão 200 páginas ≈ 50 mil clientes)',
      'Remova AVEC_MOCK da Vercel (se existir)',
      'Redeploy → Admin → Testar conexão → Rodar sync full',
      'Cérebro (Waltter) passa a mostrar receita/atendidos assim que o sync popular o Neon',
    ],
    link: {
      href: 'https://documenter.getpostman.com/view/12527228/2sA2xmUWJo',
      label: 'Docs Postman Avec',
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp (Evolution)',
    envVars: ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_API_INSTANCE', 'WHATSAPP_WEBHOOK_SECRET'],
    priority: 'quando_tiver',
    steps: [
      'Subir ou contratar instância Evolution API',
      'Criar instância e conectar número WhatsApp (QR code)',
      'Vercel: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_API_INSTANCE',
      'Gere WHATSAPP_WEBHOOK_SECRET (openssl rand -hex 32)',
      'Webhook Evolution → https://seu-dominio/api/webhooks/whatsapp',
      'Header: x-whatsapp-secret = WHATSAPP_WEBHOOK_SECRET',
      'Opcional: TELEGRAM_STAFF_CHAT_IDS para alertas de handoff',
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram bot (equipe)',
    envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_STAFF_CHAT_IDS'],
    priority: 'opcional',
    steps: [
      'Telegram → @BotFather → /newbot → copie o token',
      'Vercel → TELEGRAM_BOT_TOKEN = token do bot',
      'Gere TELEGRAM_WEBHOOK_SECRET (string aleatória)',
      'setWebhook: https://seu-dominio/api/webhooks/telegram + secret_token',
      'TELEGRAM_STAFF_CHAT_IDS = IDs da equipe (recomendado em produção)',
      'Descubra seu chat ID: @userinfobot ou getUpdates',
    ],
    link: { href: 'https://t.me/BotFather', label: '@BotFather' },
  },
]

export function isItemConfigured(
  id: string,
  health: {
    database: { connected: boolean }
    claude: { configured: boolean }
    avec: { token: boolean; webhook_secret?: boolean }
    whatsapp: { configured: boolean; webhook_secret?: boolean }
    telegram: { configured: boolean; webhook_secret?: boolean; staff_whitelist?: boolean }
    cron: { configured: boolean }
    auth: { enabled: boolean }
    deployment?: { panel: string }
    validation?: { ok: boolean }
    webhooks?: { avec_secret?: boolean }
  }
) {
  switch (id) {
    case 'auth':
      return health.auth.enabled
    case 'panel':
      return Boolean(health.deployment?.panel) && (health.validation?.ok ?? true)
    case 'cron':
      return health.cron.configured
    case 'claude':
      return health.claude.configured
    case 'avec':
      return health.avec.token
    case 'avec_webhook':
      return Boolean(health.avec.webhook_secret ?? health.webhooks?.avec_secret)
    case 'whatsapp':
      return health.whatsapp.configured && Boolean(health.whatsapp.webhook_secret)
    case 'telegram':
      return (
        health.telegram.configured &&
        Boolean(health.telegram.webhook_secret) &&
        Boolean(health.telegram.staff_whitelist)
      )
    default:
      return false
  }
}
