# Sync Avec — ROM Iguatemi

## Modos

| Modo | URL | Frequência recomendada | Relatórios |
|------|-----|------------------------|------------|
| **fast** | `POST /api/avec/sync?mode=fast` | A cada 5 min | 0051, 0002, faturamento, cancelamentos (só hoje) |
| **full** | `POST /api/avec/sync?mode=full` | 1×/dia (8h) | + catálogo clientes 0004 + janela ampla |

Header: `Authorization: Bearer $CRON_SECRET`

## Vercel Hobby (plano atual)

O Hobby **só permite 1 cron/dia**. O `vercel.json` roda apenas o **full** às 8h.

### Sync fast a cada 5 min (grátis)

Use [cron-job.org](https://cron-job.org) ou similar:

```
POST https://rom-iguatemi.vercel.app/api/avec/sync?mode=fast
Header: Authorization: Bearer SEU_CRON_SECRET
Schedule: */5 * * * *
```

### Vercel Pro

Descomente no `vercel.json`:

```json
{
  "path": "/api/avec/sync?mode=fast",
  "schedule": "*/5 * * * *"
}
```

## Unidade

Todas as métricas e logs referem **ROM Iguatemi** (`SALON_UNIT_NAME`).

Não reutilize o token, banco ou domínio do ROM Brasil — este projeto é da unidade Iguatemi.

## Variáveis

```
SALON_UNIT_NAME=ROM Iguatemi
SALON_UNIT_SLUG=rom-iguatemi
SALON_DAILY_GOAL=5000
AVEC_API_TOKEN=...
AVEC_UNIT_ID=...   # obrigatório para filtrar site nos relatórios
CRON_SECRET=...
```

Sem `AVEC_UNIT_ID`, o sync avisa e pode misturar unidades se o token Avec for compartilhado.
`AVEC_MOCK` é bloqueado em produção.
