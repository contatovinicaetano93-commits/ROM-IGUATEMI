-- Auditoria e alertas operacionais (antes só existiam no stub MigrationRunner).

create table if not exists audit_logs (
  id uuid primary key,
  username text not null,
  role text not null,
  action text not null,
  resource text not null,
  changes jsonb,
  ip_address text,
  status text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_username on audit_logs (username);
create index if not exists idx_audit_logs_action on audit_logs (action);
create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);

create table if not exists alerts (
  id uuid primary key,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_alerts_type on alerts (type);
create index if not exists idx_alerts_resolved_at on alerts (resolved_at);
