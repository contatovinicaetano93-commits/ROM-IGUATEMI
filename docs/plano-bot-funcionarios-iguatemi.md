# Plano — Bot de funcionários + KPIs por profissional (ROM Iguatemi)

> Unidade: **ROM Iguatemi** · Repo: `ROM-IGUATEMI` · Produção: https://rom-iguatemi.vercel.app  
> Status: **plano** (sem implementação ainda). Depende de `AVEC_API_TOKEN`.  
> Espelho do plano Brasil — **infra e bots separados**, sem compartilhar token/banco/domínio.

## Objetivo

1. KPIs por profissional na plataforma (agenda Avec sincronizada).
2. Bot Telegram **separado** só para funcionários — cada um vê **apenas a própria agenda**.

O bot de gestão (`TELEGRAM_BOT_TOKEN`) continua da recepção/admin.  
Funcionários usam outro bot (`TELEGRAM_STAFF_BOT_TOKEN`).

---

## Pré-requisitos

| Item | Status |
|------|--------|
| App + Neon + cron fast | ✅ (cron-job.org) |
| `AVEC_API_TOKEN` | ⬜ bloqueio |
| Relatórios 0051 / 0002 com campo profissional | ⬜ validar no primeiro sync |
| Bot Telegram novo (BotFather) | ⬜ fase 3 |

Normalize já lê `profissional` / `profissional_nome`.  
Sync ainda envia `profissional_id: ''` — preencher quando o formato Avec da unidade Iguatemi for confirmado.

---

## Modelo de dados (Neon Iguatemi)

```sql
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  avec_pro_id text unique,
  name text not null,
  telegram_chat_id text unique,
  active boolean not null default true,
  daily_goal numeric(12,2),
  created_at timestamptz not null default now()
);

alter table client_services
  add column if not exists professional_id uuid references professionals(id),
  add column if not exists avec_professional_name text;

create table if not exists professional_daily_metrics (
  day date not null,
  professional_id uuid not null references professionals(id),
  appointments int not null default 0,
  attended int not null default 0,
  no_shows int not null default 0,
  revenue numeric(12,2) not null default 0,
  primary key (day, professional_id)
);
```

Banco **dedicado** — nunca reutilizar o Neon do ROM Brasil.

---

## Sync Avec

1. `mode=fast` / `full`: upsert `professionals` + vincular serviços.
2. Recomputar métricas do dia (fuso SP).
3. Poucos relatórios Tier A — não sincronizar catálogo inteiro.

---

## KPIs na plataforma (fase 2)

Tela **Equipe** (admin):

| KPI | Uso |
|-----|-----|
| Agenda hoje | carga do profissional |
| Ocupação | ocioso vs lotado |
| Atendidos / no-shows | operação |
| Faturamento | se o relatório trouxer pro |

UI enxuta — sem BI pesado.

---

## Bot funcionários (fase 3)

### Env (só Iguatemi)

```
TELEGRAM_STAFF_BOT_TOKEN=...
TELEGRAM_STAFF_WEBHOOK_SECRET=...
# https://rom-iguatemi.vercel.app/api/webhooks/telegram-staff
```

### Segurança

- Fail-closed sem mapeamento `telegram_chat_id`
- Queries sempre filtradas por `professional_id`
- Sem dados de outros profissionais / outras unidades

### Comandos

| Comando | Resposta |
|---------|----------|
| `/start` | ROM Iguatemi + nome do profissional |
| `/hoje` | Agenda de hoje (só dele) |
| `/agenda` | Próximos horários |
| `/meta` | Meta individual (se configurada) |

---

## Web `/eu` (fase 4, opcional)

Login do profissional → só a própria agenda.

---

## Rollout

1. Token Avec + validar campo profissional  
2. KPIs por profissional na UI  
3. Bot funcionários + vínculo chat ↔ pro  
4. `/eu` (opcional)

---

## Isolamento vs ROM Brasil

| | Brasil | Iguatemi |
|--|--------|----------|
| Vercel | `rom-club` | `rom-iguatemi` |
| Neon | `rom-club` | `ROM-IGUATEMI` |
| Bot gestão | próprio | próprio |
| Bot funcionários | próprio | próprio |
| `CRON_SECRET` | distinto | distinto |

---

## Referências

- Sync: `docs/avec-sync-rom-iguatemi.md`
- Plano espelho Brasil: repo `ROM_BRASIL` → `docs/plano-bot-funcionarios-rom-brasil.md`
