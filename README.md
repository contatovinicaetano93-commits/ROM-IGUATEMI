# ROM Iguatemi — Onboarding & Painel de KPIs

Sistema interno da frente de caixa do **ROM Club · unidade Iguatemi**: recebe
contatos por WhatsApp (IA de primeiro atendimento), Telegram (secretária da
equipe) e Avec (sync de agenda/clientes), e centraliza tudo num painel de KPIs.

Stack: Next.js (App Router) + TypeScript + Tailwind + Neon (Postgres serverless),
API-first (front-end só fala com `/api/*`). Acesso ao banco por SQL direto
(`@neondatabase/serverless`).

**Unidade:** defaults em `SALON_UNIT_NAME=ROM Iguatemi` / `rom-iguatemi`.
Não compartilhe banco, token Avec, WhatsApp ou domínio com o ROM Brasil.

**Interface adaptativa:** mobile-first no celular (bottom bar, drawer) e layout
desktop completo a partir de `lg` (sidebar fixa, conteúdo em largura total até
1600px, painel em duas colunas).

## Como funciona

- `src/app/api/webhooks/avec` — webhook push (agendamento, atendimento, cliente).
- `src/app/api/avec/sync` — sincronização com a API de Relatórios Avec
  (clientes `0004`, agendamentos `0051`, atendidos `0002`). Roda via cron
  1x/dia (8h) ou manualmente com `CRON_SECRET`. Ver `docs/avec-sync-rom-iguatemi.md`.
- `src/app/api/webhooks/whatsapp` — recebe mensagem do provedor WhatsApp
  (Evolution API), responde com IA (primeiro atendimento guiado) e loga tudo.
- `src/app/api/webhooks/telegram` — bot "secretária": equipe pergunta em
  linguagem natural, a IA responde puxando os KPIs do Neon.
- `src/app/dashboard` — painel com contatos por dia, por canal, por status e
  taxa de conversão.
- `src/app/contatos` — lista dos últimos contatos (todos os canais) e formulário
  pra registrar contato manual (`GET`/`POST /api/contacts`).
- `src/lib/whatsapp/adapter.ts` — interface de mensageria. Hoje implementada
  com Evolution API; trocar para WhatsApp Cloud API oficial no futuro é só
  implementar a interface de novo, sem mexer no resto.

Resiliência: todo evento (mensagem recebida, resposta da IA, erro) vira uma
linha em `contact_events` — nada se perde silenciosamente, dá pra reprocessar
ou investigar depois.

## Go-live Iguatemi (checklist)

1. **Vercel** — projeto novo ligado a este repo (`ROM-IGUATEMI`), não reusar `rom-club`.
2. **Neon** — banco dedicado Iguatemi + rodar `db/schema.sql` + `DATABASE_URL`.
3. **Auth** — `ROM_ADMIN_USER` / `ROM_ADMIN_PASSWORD` + `CRON_SECRET`.
4. **Unidade** — `SALON_UNIT_NAME=ROM Iguatemi`, `SALON_UNIT_SLUG=rom-iguatemi`, meta diária.
5. **Avec** — token + `AVEC_UNIT_ID` da unidade Iguatemi; Admin → Testar → Sync.
6. **Claude** — `ANTHROPIC_API_KEY` (briefings, WhatsApp, Telegram).
7. **WhatsApp** — Evolution com número Iguatemi → webhook deste deploy.
8. **Telegram** — bot dedicado + `TELEGRAM_STAFF_CHAT_IDS` da equipe Iguatemi.
9. **Cron fast** — cron-job.org → `POST /api/avec/sync?mode=fast` (Hobby).
10. **Bot funcionários** — plano: [`docs/plano-bot-funcionarios-iguatemi.md`](docs/plano-bot-funcionarios-iguatemi.md).

Detalhes no `/admin` (SetupChecklist) e em `.env.example`.

## Rodando local

```bash
npm install
cp .env.example .env.local   # preencher as chaves da unidade Iguatemi
npm run dev
```
