-- Canonical Mastra editorial spine. Existing editorial objects remain intact;
-- new and reconciled runs use these records for end-to-end provenance.
create table if not exists editorial_runs (
  id uuid primary key default gen_random_uuid(),
  workflow text not null,
  workflow_version text not null default 'mastra-bat-1',
  status text not null default 'queued',
  directive text not null,
  persona_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  published_at timestamptz
);

create index if not exists editorial_runs_status_created_idx
  on editorial_runs (status, created_at desc);

create table if not exists editorial_stage_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references editorial_runs(id) on delete cascade,
  stage text not null,
  agent text not null,
  status text not null default 'queued',
  attempt integer not null default 1,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  source_ids uuid[] not null default '{}',
  provider jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, stage, attempt)
);

create index if not exists editorial_stage_runs_run_idx
  on editorial_stage_runs (run_id, created_at);

create table if not exists persona_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  content text not null,
  source_run_id uuid references editorial_runs(id) on delete set null,
  source_object_id uuid,
  confidence numeric(5,4) not null default 1.0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persona_memory_active_idx
  on persona_memory (active, kind, updated_at desc);

create table if not exists publication_packages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references editorial_runs(id) on delete cascade,
  editorial_object_id uuid,
  homepage_snapshot_id uuid,
  status text not null default 'prepared',
  package jsonb not null default '{}'::jsonb,
  source_ids uuid[] not null default '{}',
  rejection_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
