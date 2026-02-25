-- Add pipeline threshold to projects
alter table projects add column pipeline_threshold integer not null default 80;

-- Pipeline runs table
create table pipeline_runs (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  specification_id  uuid not null references specifications(id) on delete cascade,
  spec_version_id   uuid not null references specification_versions(id) on delete cascade,
  status            text not null default 'pending'
                    check (status in ('pending','worktree','coding','reviewing','merging','success','failed','cancelled')),
  current_step      text check (current_step in ('worktree','coding','reviewing','merging')),
  worktree_branch   text,
  worktree_path     text,
  review_score      integer check (review_score >= 0 and review_score <= 100),
  review_threshold  integer not null,
  error_message     text,
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);

alter table pipeline_runs enable row level security;
create policy "allow all" on pipeline_runs for all using (true) with check (true);
alter publication supabase_realtime add table pipeline_runs;
