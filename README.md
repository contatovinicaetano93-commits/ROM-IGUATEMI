# ROM CLUB IGUATEMI

Painel operacional **independente** da unidade Iguatemi do ROM CLUB BRASIL.

Recebe contatos por WhatsApp (IA), Telegram (secretária da equipe) e Avec (sync de agenda/clientes), com playbook do dia, briefings e KPIs.

> Repositório dedicado à unidade **Iguatemi**. O painel Brasil vive no repositório `ROM`.

Stack: Next.js 16 + TypeScript + Tailwind + Neon Postgres.

## Deploy rápido

1. **Neon** — projeto `rom-club-iguatemi` → rodar `db/schema.sql`
2. **Vercel** — importar este repo → projeto `rom-club-iguatemi`
3. **Env vars** — copiar de `deploy/vercel-rom-club-iguatemi.env`
4. **Admin** → seed preset Iguatemi

Guia completo: [`deploy/SETUP-IGUATEMI.md`](deploy/SETUP-IGUATEMI.md)

## Variáveis obrigatórias (Production)

```env
ROM_PANEL=iguatemi
NEXT_PUBLIC_ROM_PANEL=iguatemi
DATABASE_URL=          # Neon Iguatemi — exclusivo
AVEC_API_TOKEN=        # Token Avec da loja Iguatemi
ROM_ADMIN_PASSWORD=
CRON_SECRET=
```

## Rodando local

```bash
npm install
cp deploy/vercel-rom-club-iguatemi.env .env.local
# preencher DATABASE_URL e demais chaves
npm run dev
```

## Criar este repositório no GitHub (primeira vez)

Se o repo ainda não existe na sua conta:

```bash
chmod +x scripts/create-iguatemi-repo.sh
./scripts/create-iguatemi-repo.sh
```

Ou manualmente: GitHub → New repository → `ROM-iguatemi` → push deste código.

## Isolamento

| Recurso | Compartilha com Brasil? |
|---------|-------------------------|
| Repositório Git | **Não** (este repo) |
| Neon `DATABASE_URL` | **Não** |
| `AVEC_API_TOKEN` | **Não** |
| WhatsApp / Telegram | **Não** |
