# ROM CLUB IGUATEMI — deploy independente

Repositório **ROM-iguatemi** — instância isolada do ROM CLUB BRASIL.

## Isolamento

| Recurso | Iguatemi (este repo) |
|---------|----------------------|
| Repositório Git | `ROM-iguatemi` |
| Projeto Vercel | `rom-club-iguatemi` |
| Projeto Neon | `rom-club-iguatemi` |
| `DATABASE_URL` | exclusivo |
| `AVEC_API_TOKEN` | loja Iguatemi |
| WhatsApp / Telegram | instância/bot Iguatemi |

## Criar repositório no GitHub (se ainda não existe)

```bash
chmod +x scripts/create-iguatemi-repo.sh
./scripts/create-iguatemi-repo.sh
```

## Passo 1 — Neon

1. [console.neon.tech](https://console.neon.tech) → **New Project** → `rom-club-iguatemi`
2. SQL Editor → executar `db/schema.sql`
3. Copiar connection string → `DATABASE_URL`

## Passo 2 — Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project**
2. Importar repositório **`ROM-iguatemi`** (não o ROM Brasil)
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

### WhatsApp (ManyChat)

- `MANYCHAT_API_KEY` na Vercel (API da página Iguatemi)
- Opcional: `MANYCHAT_OUTBOUND_FLOW_NS` (fluxo template aftercare)
- Webhook External Request: `https://SEU-DOMINIO/api/webhooks/whatsapp`
- Header: `x-whatsapp-secret`

### Avec (opcional webhook push)

- URL: `https://SEU-DOMINIO/api/webhooks/avec`
- Header: `x-avec-secret`

## Validação

- [ ] Admin mostra `painel=iguatemi`
- [ ] Contatos do Brasil **não** aparecem
- [ ] Sync Avec stats com `panel: iguatemi`
- [ ] Briefing ✨ funciona em `/hoje`
