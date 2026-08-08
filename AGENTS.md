<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regras de trabalho — painéis ROM

Leia isto antes de começar qualquer tarefa nestes repos.

## O sistema

Três apps Next.js na Vercel: **ROM Brasil** e **ROM Iguatemi** (painéis das unidades, ~60 rotas cada, mantidos em paridade) e o **Cérebro** (consolida as duas). Os bancos são **Supabase**, um projeto por unidade — as variáveis ainda se chamam `NEON_*` por herança, ignore o nome. Os dados chegam pelo sync da Avec (cron na Vercel) e caem em `salon_*_daily`, `contacts`, `client_services`, `avec_sync_runs`.

Todo PR passa por CI (teste + build bloqueiam, lint é informativo).

## Antes de escrever qualquer código

**1. Confirme que isso ainda não existe — pelo comportamento, não pelo nome.**

Este é o erro mais caro nestes repos. A `main` repetidamente já tem a solução, implementada com outro nome. Procurar pelo símbolo que você ia criar e não achar **não prova** que falta.

Exemplo real: um PR de conciliação de pagamento ficou aberto semanas como "pendente" porque ninguém encontrou `paymentsReconcileBase` na main. O comportamento estava lá o tempo todo, escrito como `inner join salon_daily_metrics on d.day = p.day` com guarda `dayPay > 0`. Reimplementar teria sido trabalho jogado fora.

Procure pela **regra de negócio**, não pelo identificador.

**2. Confirme que você mesmo já não tentou isso.**

Antes de cortar branch nova, liste os PRs abertos e procure um seu sobre o mesmo assunto. Se existir: **continue nele**. Não corte uma branch nova da main.

Hoje existem grupos inteiros de PRs que são a mesma tarefa refeita do zero — três branches para o mesmo fix de sync, duas para o mesmo KPI, duas que diferem por uma constante. Nenhuma é ancestral de outra. Isso multiplica conflito e faz o trabalho útil ficar parado.

**3. Parta do `origin/main` atualizado.** Não do checkout local — ele pode estar centenas de commits atrás.

## Decisões vigentes — não contrarie sem dizer explicitamente

Se a sua tarefa exige quebrar uma destas, tudo bem, mas **escreva no PR que está quebrando e por quê**. Mudar em silêncio é o problema.

- **KPI ausente é `null`, não `0`.** A interface mostra "—" para null. Um `0` falso é pior que um buraco, porque parece medição real. Nunca `coalesce(métrica, 0)`, nunca `Number(x) || 0`, nunca `NOT NULL DEFAULT 0` em coluna de KPI.
- **Brasil e Iguatemi são Supabase.** Não Neon, apesar dos nomes das variáveis.
- **As duas unidades ficam em paridade.** Mudou numa, ou muda na outra, ou diz no PR que criou drift de propósito.
- **A equipe usa WhatsApp, não Telegram.**
- **Concorrência de sync é lock distribuído em Postgres.** Contador em memória não funciona em serverless — cada invocação é um processo novo.

## Ao terminar a tarefa

**Tire o PR de rascunho.** Rascunho não mergeia, e não mergear é o gargalo real aqui — não a produção de código. Se a tarefa foi abandonada, feche o PR em vez de deixar aberto.

**Não deixe código morto.** Se removeu o último uso de um módulo, remova o módulo. Se removeu o módulo, remova ou reaponte o teste dele — teste verde sobre código morto é pior que nenhum teste, porque dá cobertura falsa.

**Se criou monitoramento, prove que ele consegue ficar vermelho.** Havia aqui um endpoint de saúde que reportava "tudo verde" sempre, porque o contador que ele lia nunca era incrementado. Monitor que só sabe dar boa notícia é pior que não ter.

## Infra pede cuidado extra

`.github/workflows/`, `vercel.json`, migrations e `next.config` são onde mora o risco caro, e é onde menos gente olha.

Antes de mexer, responda três perguntas no PR: **o que acontece se rodar duas vezes? o que acontece se rodar apontando para a branch errada? isso apaga alguma coisa?**

Qualquer `--force`, `DROP`, `TRUNCATE` ou push direto para `main` precisa de justificativa explícita. Havia aqui um workflow que, com um clique, empurrava à força uma branch congelada por cima do `main` de outro repo — teria apagado onze dias de trabalho.

## O que ainda está quebrado e não foi corrigido

Se for pegar tarefa nova, estes são reais e estão sem dono:

- **`maxDuration = 800` em `/api/avec/sync*` exige Fluid Compute na Vercel.** Rotas devem logar `warnIfLongMaxDuration` no cold start. Sem Fluid, full morre em ~300s.
- **Lint ainda não é gate bloqueante** (passivo atual: `no-explicit-any`, `no-unused-vars`, `react-hooks/refs`; `set-state-in-effect` já zerou).
- **`reminders/financeiro` não será ativado no IG por enquanto** (decisão: sem WhatsApp financeiro para a equipe Iguatemi). Não portar a rota/cron até nova decisão.

## Drift BR ↔ IG (intencional ou conhecido — não “descobrir” de novo)

As unidades devem permanecer em **paridade de produto**. Diferenças abaixo são conhecidas; se for mudar, diga no PR:

| Item | Estado |
|------|--------|
| Páginas do painel | Em paridade (~16) |
| `/api/reminders/financeiro` | **Só BR.** IG não ativa (sem WhatsApp financeiro por enquanto). |
| `/api/docs`, `/api/webhooks/telegram-staff` | **Só BR** (Telegram legado / OpenAPI). |
| `/api/avec/probe-0011` | **Só IG** (diagnóstico de visitas). |
| `useClientLoader` | **Só IG** (padrão de fetch client); BR usa outros hooks. |
| `src/lib/db.ts` | Implementações divergem (cache/overlay IG vs Map multi-URL BR) — mesmo contrato `getSql`. |
| `warnIfLongMaxDuration` / `vercel-runtime.ts` | Deve existir nos dois; se faltar num lado, é bug de paridade. |
