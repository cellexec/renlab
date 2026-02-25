-- Specifications table
create table specifications (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete set null,
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Specification versions table
create table specification_versions (
  id                uuid primary key default gen_random_uuid(),
  specification_id  uuid not null references specifications(id) on delete cascade,
  content           text not null default '',
  version_number    integer not null,
  change_note       text,
  created_at        timestamptz not null default now(),
  constraint uq_spec_version unique (specification_id, version_number)
);

create index idx_spec_versions on specification_versions(specification_id, version_number);

-- RLS
alter table specifications enable row level security;
create policy "allow all" on specifications for all using (true) with check (true);
alter table specification_versions enable row level security;
create policy "allow all" on specification_versions for all using (true) with check (true);

-- Realtime
alter publication supabase_realtime add table specifications;
alter publication supabase_realtime add table specification_versions;
