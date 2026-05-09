create extension if not exists pgcrypto;

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_name text,
  source_url text not null,
  title text,
  author text,
  published_at timestamptz,
  fetched_at timestamptz default now(),
  raw_html text,
  raw_text text,
  canonical_url text,
  hash text unique,
  metadata jsonb default '{}'::jsonb
);

create table if not exists source_embeddings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding_ref text,
  metadata jsonb default '{}'::jsonb
);

create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  active_score numeric default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb default '{}'::jsonb
);

create table if not exists theme_members (
  theme_id uuid references themes(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  score numeric default 0,
  primary key (theme_id, source_id)
);

create table if not exists editorial_objects (
  id uuid primary key default gen_random_uuid(),
  object_type text not null,
  status text not null default 'draft',
  title text,
  slug text unique,
  dek text,
  body_md text,
  summary text,
  voice_profile text,
  theme_id uuid references themes(id),
  primary_source_ids jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);

create table if not exists homepage_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text default 'draft',
  layout_json jsonb not null,
  rationale text,
  created_at timestamptz default now(),
  published_at timestamptz
);

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  status text not null default 'draft',
  editorial_object_id uuid references editorial_objects(id),
  body text not null,
  thread_group text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  published_at timestamptz
);

create table if not exists voice_memory (
  id uuid primary key default gen_random_uuid(),
  memory_type text not null,
  key text not null,
  value text not null,
  weight numeric default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(memory_type, key)
);

create table if not exists trend_observations (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid references themes(id),
  observation_date date not null,
  title text,
  summary text,
  change_type text,
  confidence numeric default 0,
  metadata jsonb default '{}'::jsonb
);

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

create table if not exists revision_history (
  id uuid primary key default gen_random_uuid(),
  object_table text not null,
  object_id uuid not null,
  action text not null,
  actor text,
  snapshot jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_sources_fetched_at on sources (fetched_at desc);
create index if not exists idx_themes_active_score on themes (active_score desc);
create index if not exists idx_editorial_objects_status on editorial_objects (status);
create index if not exists idx_social_posts_status on social_posts (status);
create index if not exists idx_analysis_briefs_scope on analysis_briefs (scope_type, updated_at desc);
