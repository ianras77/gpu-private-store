create table if not exists analysis_briefs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_key text not null,
  status text not null default 'active',
  label text,
  title text,
  summary text,
  confidence numeric default 0,
  source_count int default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(scope_type, scope_key)
);

create index if not exists idx_analysis_briefs_scope
on analysis_briefs (scope_type, updated_at desc);
