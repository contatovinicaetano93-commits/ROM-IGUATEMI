-- Área de vídeos de onboarding (Trilha B, Sprint T2) — conteúdo publicado na
-- intranet (T1) já existente. Pilares editáveis, sem lista fixa no código.
create table if not exists onboarding_pillars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  order_index int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists onboarding_pillars_name_idx
  on onboarding_pillars (lower(name)) where active = true;

create table if not exists onboarding_videos (
  id uuid primary key default gen_random_uuid(),
  pillar_id uuid references onboarding_pillars (id) on delete set null,
  title text not null,
  description text,
  video_url text not null,
  thumbnail_url text,
  duration_seconds int,
  order_index int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_videos_pillar_idx on onboarding_videos (pillar_id);

insert into onboarding_pillars (name, description, order_index)
select v.name, v.description, v.order_index from (values
  ('Cultura & Padrão ROM', 'História, recorde Guinness e o que diferencia o atendimento ROM.', 1),
  ('Experiência do Cliente', 'Recepção, consulta e condução do atendimento do início ao fim.', 2),
  ('Técnica & Qualidade', 'Padrão de coloração e mechas criativas, quando escalar pra outro profissional.', 3),
  ('Segurança & Produtos', 'Manuseio químico, EPIs e parcerias de produto.', 4),
  ('Políticas & Convivência', 'Escala, faltas, comissão e comunicação interna.', 5)
) as v(name, description, order_index)
where not exists (select 1 from onboarding_pillars p where lower(p.name) = lower(v.name));
