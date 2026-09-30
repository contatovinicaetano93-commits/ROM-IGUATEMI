-- Contatos list/counts: urgency CTE scans client_services WHERE active = true
-- and groups by contact_id. Existing client_services_active_idx only indexes the
-- boolean; client_services_contact_idx includes inactive rows.
-- Partial index on contact_id (active only) + cadence/schedule columns for
-- index-only friendly plans in rankUrgentContactIds / countUrgencyQueues.
create index if not exists client_services_active_contact_idx
  on client_services (contact_id)
  include (name, cadence_days, last_done_at, scheduled_at)
  where active = true;

-- Fila Novos: channel=avec + avec_client_id IS NULL + created_at window.
-- Unique avec index does not help NULL lookups; channel/created_at alone are wide.
create index if not exists contacts_novos_pending_idx
  on contacts (created_at desc)
  where anonymized_at is null
    and channel = 'avec'
    and avec_client_id is null
    and status <> 'importado';
