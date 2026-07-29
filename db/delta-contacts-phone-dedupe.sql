-- Deduplica contacts por telefone (dígitos) e reaponta FKs.
-- Sem DO $$ / TEMP ON COMMIT — o runner executa statement a statement (autocommit).
-- Phone canônico alinhado a normalizePhone: 10/11 dígitos BR → +55…; demais → +dígitos.

create table if not exists _mig_contact_phone_dedupe (
  donor_id uuid primary key,
  survivor_id uuid not null
);

truncate _mig_contact_phone_dedupe;

insert into _mig_contact_phone_dedupe (donor_id, survivor_id)
select d.id as donor_id, s.id as survivor_id
from (
  select
    id,
    regexp_replace(phone, '\D', '', 'g') as digits,
    row_number() over (
      partition by regexp_replace(phone, '\D', '', 'g')
      order by
        (avec_client_id is not null)::int desc,
        (name is not null and length(trim(name)) > 0)::int desc,
        (email is not null)::int desc,
        last_contact_at desc nulls last,
        created_at desc
    ) as rn
  from contacts
  where phone is not null
    and length(regexp_replace(phone, '\D', '', 'g')) >= 10
) d
join (
  select id, regexp_replace(phone, '\D', '', 'g') as digits
  from (
    select
      id,
      phone,
      row_number() over (
        partition by regexp_replace(phone, '\D', '', 'g')
        order by
          (avec_client_id is not null)::int desc,
          (name is not null and length(trim(name)) > 0)::int desc,
          (email is not null)::int desc,
          last_contact_at desc nulls last,
          created_at desc
      ) as rn
    from contacts
    where phone is not null
      and length(regexp_replace(phone, '\D', '', 'g')) >= 10
  ) x
  where rn = 1
) s on s.digits = d.digits
where d.rn > 1;

update client_services cs
set contact_id = m.survivor_id
from _mig_contact_phone_dedupe m
where cs.contact_id = m.donor_id;

update contact_events ce
set contact_id = m.survivor_id
from _mig_contact_phone_dedupe m
where ce.contact_id = m.donor_id;

delete from contact_brief_cache c
using _mig_contact_phone_dedupe m
where c.contact_id = m.donor_id;

update whatsapp_aftercare_messages w
set contact_id = m.survivor_id
from _mig_contact_phone_dedupe m
where w.contact_id = m.donor_id;

update contacts s
set
  name = coalesce(s.name, d.name),
  email = coalesce(s.email, d.email),
  avec_client_id = coalesce(
    s.avec_client_id,
    case
      when d.avec_client_id is null then null
      when exists (
        select 1 from contacts x
        where x.avec_client_id = d.avec_client_id and x.id <> s.id
      ) then null
      else d.avec_client_id
    end
  ),
  preferred_manicurist = coalesce(s.preferred_manicurist, d.preferred_manicurist),
  preferred_hairstylist = coalesce(s.preferred_hairstylist, d.preferred_hairstylist),
  notes = coalesce(s.notes, d.notes),
  last_contact_at = greatest(s.last_contact_at, d.last_contact_at)
from _mig_contact_phone_dedupe m
join contacts d on d.id = m.donor_id
where s.id = m.survivor_id;

update contacts c
set phone = null, avec_client_id = null
from _mig_contact_phone_dedupe m
where c.id = m.donor_id;

delete from contacts c
using _mig_contact_phone_dedupe m
where c.id = m.donor_id;

-- Normaliza para o mesmo formato de normalizePhone (lib/avec/normalize.ts)
update contacts c
set phone = case
  when length(regexp_replace(c.phone, '\D', '', 'g')) in (10, 11)
    then '+55' || regexp_replace(c.phone, '\D', '', 'g')
  else '+' || regexp_replace(c.phone, '\D', '', 'g')
end
where c.phone is not null
  and c.phone !~ '^\+[0-9]+$'
  and length(regexp_replace(c.phone, '\D', '', 'g')) >= 10
  and not exists (
    select 1 from contacts o
    where o.id <> c.id
      and o.phone = case
        when length(regexp_replace(c.phone, '\D', '', 'g')) in (10, 11)
          then '+55' || regexp_replace(c.phone, '\D', '', 'g')
        else '+' || regexp_replace(c.phone, '\D', '', 'g')
      end
  );

drop table if exists _mig_contact_phone_dedupe;

create unique index if not exists contacts_phone_idx on contacts (phone);
create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id);
