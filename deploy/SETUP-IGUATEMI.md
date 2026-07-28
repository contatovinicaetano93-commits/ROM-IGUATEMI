# ROM CLUB IGUATEMI — deploy independente

Repositório **ROM-iguatemi** — instância isolada do ROM CLUB BRASIL.

## Isolamento

| Recurso | Iguatemi (este repo) |
|---------|----------------------|
| Repositório Git | `ROM-iguatemi` |
| Projeto Vercel | `rom-iguatemi` |
| Banco | Supabase (projeto dedicado Iguatemi) |
| `DATABASE_URL` | exclusivo — pooler `*.pooler.supabase.com` |
| `AVEC_API_TOKEN` | loja Iguatemi |
| WhatsApp / Telegram | instância/bot Iguatemi |

> BR e IG usam **Supabase**. Só o **Cérebro** usa Neon.

## Criar repositório no GitHub (se ainda não existe)

```bash
chmod +x scripts/create-iguatemi-repo.sh
./scripts/create-iguatemi-repo.sh
```

## Passo 1 — Supabase

1. [supabase.com](https://supabase.com) → projeto dedicado Iguatemi
2. SQL Editor → executar `db/schema.sql`
3. Connection string (Transaction pooler `:6543`) → `DATABASE_URL`
4. Session pooler (`:5432`) → `DATABASE_URL_UNPOOLED` (scripts)

## Passo 2 — Vercel

Continue no README / checklist do painel. Nunca copie `DATABASE_URL` do Brasil.
