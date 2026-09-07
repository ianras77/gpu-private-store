create table if not exists report_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued',
  kind text not null,
  directive text not null,
  current_stage text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists report_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references report_runs(id),
  slug text not null unique,
  status text not null default 'draft',
  kind text not null,
  title text not null,
  artifact jsonb not null,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists idx_report_runs_status on report_runs(status, updated_at desc);
create index if not exists idx_report_artifacts_status on report_artifacts(status, updated_at desc);
