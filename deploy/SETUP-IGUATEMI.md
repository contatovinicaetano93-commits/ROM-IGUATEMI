# ROM CLUB IGUATEMI — deploy independente

Instância **100% isolada** do ROM CLUB BRASIL. Mesmo repositório GitHub, projeto Vercel e Neon próprios.

## Isolamento garantido

| Recurso | Brasil | Iguatemi |
|---------|--------|----------|
| Repositório Git | `ROM` (compartilhado) | `ROM` (compartilhado) |
| Projeto Vercel | `rom-club-brasil` | `rom-club-iguatemi` |
| Projeto Neon | `rom-club-brasil` | `rom-club-iguatemi` |
| `DATABASE_URL` | exclusivo | exclusivo |
| `AVEC_API_TOKEN` | loja Brasil | loja Iguatemi |
| WhatsApp / Telegram | instância/bot Brasil | instância/bot Iguatemi |

## Passo 1 — Neon

1. [console.neon.tech](https://console.neon.tech) → **New Project** → `rom-club-iguatemi`
2. SQL Editor → executar `db/schema.sql`
3. Copiar connection string → `DATABASE_URL`

## Passo 2 — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project**
2. Importar repositório `ROM`
3. Nome: `rom-club-iguatemi`
4. **Environment Variables (Production)** — usar `deploy/vercel-rom-club-iguatemi.env`
5. Deploy

## Passo 3 — Domínio

- Settings → Domains → `iguatemi.romclub.com.br` (ou equivalente)
- Anotar URL base para webhooks

## Passo 4 — Primeiro uso

1. `https://SEU-DOMINIO/login`
2. `/admin` → confirmar **ROM CLUB IGUATEMI** e sem warnings
3. Seed preset **Iguatemi** → Popular
4. Testar Avec → Sync

## Passo 5 — Integrações

### Telegram

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://SEU-DOMINIO/api/webhooks/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### WhatsApp (Evolution)

- Instância `rom-iguatemi`
- Webhook: `https://SEU-DOMINIO/api/webhooks/whatsapp`
- Header: `x-whatsapp-secret`

### Avec (opcional webhook push)

- URL: `https://SEU-DOMINIO/api/webhooks/avec`
- Header: `x-avec-secret`

## Validação

- [ ] Admin mostra `painel=iguatemi`
- [ ] Contatos do Brasil **não** aparecem
- [ ] Sync Avec stats com `panel: iguatemi`
- [ ] Briefing ✨ funciona em `/hoje`
