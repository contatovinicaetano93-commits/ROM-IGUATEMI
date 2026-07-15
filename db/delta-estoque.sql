-- Estoque — API-first (Avec é fonte da verdade; ajuste manual é só fallback).
-- Reaproveita avec_sync_runs (kind='stock_fast'|'stock_full') e avec_report_snapshots
-- já existentes — não cria tabela de sync run própria (evita duplicar observabilidade).

create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  avec_local_estoque_id text unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists stock_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_brands_name_idx on stock_brands (lower(name));

create table if not exists stock_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_categories_name_idx on stock_categories (lower(name));

create table if not exists stock_products (
  id uuid primary key default gen_random_uuid(),
  avec_product_id text unique,
  sku text,
  name text not null,
  category_id uuid references stock_categories (id) on delete set null,
  brand_id uuid references stock_brands (id) on delete set null,
  location_id uuid references stock_locations (id) on delete set null,
  unit_cost numeric(12, 2),
  unit_price numeric(12, 2),
  avg_cost numeric(12, 2),
  current_qty numeric(12, 3) not null default 0,
  minimum_qty numeric(12, 3),
  suggested_reposition numeric(12, 3),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stock_products_category_idx on stock_products (category_id);
create index if not exists stock_products_brand_idx on stock_products (brand_id);
create index if not exists stock_products_location_idx on stock_products (location_id);
create index if not exists stock_products_name_idx on stock_products (lower(name));

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references stock_products (id) on delete cascade,
  type text not null check (type in ('entrada', 'saida', 'ajuste_manual')),
  quantity numeric(12, 3) not null check (quantity > 0),
  cost numeric(12, 2),
  reason text,
  -- 0323 nunca gera linha própria (já está contido em 0044) — só enriquece o
  -- motivo de um movimento existente com a origem "pedido de compra".
  source text not null check (source in ('avec_0044', 'manual')),
  occurred_at timestamptz not null,
  synced_at timestamptz not null default now(),
  created_by text
);

create index if not exists stock_movements_product_idx on stock_movements (product_id, occurred_at desc);
create index if not exists stock_movements_occurred_idx on stock_movements (occurred_at desc);

create table if not exists stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references stock_products (id) on delete cascade,
  current_qty numeric(12, 3) not null,
  minimum_qty numeric(12, 3) not null,
  suggested_reposition numeric(12, 3),
  status text not null default 'ativo' check (status in ('ativo', 'reconhecido')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by text
);

create unique index if not exists stock_alerts_active_product_idx
  on stock_alerts (product_id) where status = 'ativo';
create index if not exists stock_alerts_status_idx on stock_alerts (status, created_at desc);
