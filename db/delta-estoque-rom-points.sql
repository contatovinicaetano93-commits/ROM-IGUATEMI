-- Locais ROM de distribuição (não vêm da Avec).
-- Modelo A: 1 Almoxarifado (retirada) + Piso 1/2/3.
-- Idempotente. Não apaga dados.
-- Soma dos saldos por ponto deve bater com stock_products.current_qty (Avec).

alter table stock_locations
  add column if not exists rom_code text,
  add column if not exists rom_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stock_locations_rom_kind_check'
  ) then
    alter table stock_locations
      add constraint stock_locations_rom_kind_check
      check (rom_kind is null or rom_kind in ('almox', 'piso'));
  end if;
end $$;

create unique index if not exists stock_locations_rom_code_uidx
  on stock_locations (rom_code)
  where rom_code is not null;

insert into stock_locations (name, rom_code, rom_kind)
select v.name, v.rom_code, v.rom_kind
from (
  values
    ('Almoxarifado', 'almox', 'almox'),
    ('Piso 1', 'piso_1', 'piso'),
    ('Piso 2', 'piso_2', 'piso'),
    ('Piso 3', 'piso_3', 'piso')
) as v(name, rom_code, rom_kind)
where not exists (
  select 1 from stock_locations sl where sl.rom_code = v.rom_code
);

create table if not exists stock_point_balances (
  product_id uuid not null references stock_products (id) on delete cascade,
  location_id uuid not null references stock_locations (id) on delete cascade,
  qty numeric(12, 3) not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

create index if not exists stock_point_balances_location_idx
  on stock_point_balances (location_id);

create table if not exists stock_point_transfers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references stock_products (id) on delete cascade,
  from_location_id uuid not null references stock_locations (id),
  to_location_id uuid not null references stock_locations (id),
  quantity numeric(12, 3) not null check (quantity > 0),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create index if not exists stock_point_transfers_product_idx
  on stock_point_transfers (product_id, created_at desc);
