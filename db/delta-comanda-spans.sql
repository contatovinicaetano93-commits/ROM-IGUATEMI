-- TM por observação do ROM: 1ª vez que vimos a comanda aberta no salão
-- vs 1ª vez que vimos Pago. Sem hora Avec — granularidade = intervalo do sync.
-- 1 linha por pessoa/dia (não por serviço). duration_minutes null = fora de 1 min–8h.

create table if not exists salon_comanda_spans (
  contact_id uuid not null references contacts (id) on delete cascade,
  day date not null,
  opened_seen_at timestamptz not null,
  paid_seen_at timestamptz,
  duration_minutes numeric(8, 1),
  created_at timestamptz not null default now(),
  primary key (contact_id, day)
);

create index if not exists salon_comanda_spans_day_idx
  on salon_comanda_spans (day);
