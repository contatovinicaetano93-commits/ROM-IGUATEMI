-- Funil CRM real: exclui dump Avec (importado) dos KPIs diários/conversão.
-- Inventário por status continua completo (inclui importado).

create or replace view v_kpi_daily as
select
  (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date as day,
  channel,
  count(*)::int as contacts_count
from contacts
where anonymized_at is null
  and status <> 'importado'
  and coalesce(source, '') not like 'avec_sync_clients%'
  and coalesce(source, '') not like 'avec_backfill%'
  and coalesce(source, '') not like 'avec_lake%'
group by 1, 2
order by 1 desc;

create or replace view v_kpi_status as
select
  status,
  count(*)::int as contacts_count
from contacts
where anonymized_at is null
group by 1;

create or replace view v_kpi_conversion as
select
  coalesce(
    count(*) filter (where status = 'convertido')::float
      / nullif(count(*) filter (where status <> 'importado'), 0)::float,
    0
  ) as conversion_rate,
  count(*)::int as total_contacts,
  count(*) filter (where status <> 'importado')::int as funnel_contacts,
  count(*) filter (where status = 'importado')::int as imported_contacts
from contacts
where anonymized_at is null;
