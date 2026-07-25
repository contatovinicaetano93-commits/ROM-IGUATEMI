-- Status "importado": base Avec (0004) distinta de lead "novo" (WhatsApp/manual).
-- Não inventa leads — só separa a massa sincronizada do funil real.

alter table contacts drop constraint if exists contacts_status_check;

alter table contacts
  add constraint contacts_status_check
  check (status in ('novo', 'importado', 'em_atendimento', 'agendado', 'convertido', 'perdido'));

-- Backfill: quem entrou só pela sync de clientes Avec e ainda está "novo".
update contacts
set status = 'importado'
where status = 'novo'
  and channel = 'avec'
  and source = 'avec_sync_clients';
