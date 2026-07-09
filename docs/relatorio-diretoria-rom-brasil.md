# Relatório diretoria — ROM Brasil

Painel: `/admin/relatorio-diretoria` (somente `ADMIN-BRASIL`).

## Fontes Avec

| Código | Uso |
|--------|-----|
| **0011** | Retorno de clientes por profissional · comparativo trimestre |
| **0021** | Faturamento + ticket médio por profissional · mês a mês |

## Agenda

- Cron Vercel: terça **08:00** America/Sao_Paulo → `POST /api/director-report` (`0 11 * * 2` UTC)
- Auth: `Authorization: Bearer $CRON_SECRET` ou sessão admin

## Preview atual

Sem `AVEC_API_TOKEN` (ou com `?mock=1`), usa:

- Série da planilha **FATURAMENTOVITOR** (Vitor M) como base
- Equipe do portfólio hairstylists 2026 (nomes; IDs Avec quando a planilha oficial chegar)

## Export

- `csv-revenue` — faturamento + ticket (modelo planilha)
- `csv-return` — taxa de retorno por trimestre
- `csv-reactivation` — lista de clientes para o profissional reativar
