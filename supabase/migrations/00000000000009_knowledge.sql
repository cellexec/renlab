-- Knowledge updates tracking
create table knowledge_updates (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  pipeline_run_id uuid references pipeline_runs(id) on delete set null,
  type            text not null default 'pipeline'
                  check (type in ('bootstrap', 'pipeline', 'manual')),
  docs_created    integer not null default 0,
  docs_updated    integer not null default 0,
  commit_sha      text,
  error_message   text,
  created_at      timestamptz not null default now()
);
alter table knowledge_updates enable row level security;
create policy "allow all" on knowledge_updates for all using (true) with check (true);
alter publication supabase_realtime add table knowledge_updates;

-- Extend pipeline_runs CHECK constraints for new steps
alter table pipeline_runs drop constraint pipeline_runs_status_check;
alter table pipeline_runs add constraint pipeline_runs_status_check
  check (status in ('pending','worktree','retrieving','coding','reviewing',
                    'merging','updating','success','failed','cancelled','rejected'));

alter table pipeline_runs drop constraint pipeline_runs_current_step_check;
alter table pipeline_runs add constraint pipeline_runs_current_step_check
  check (current_step in ('worktree','retrieving','coding','reviewing','merging','updating'));

-- Track whether knowledge existed when pipeline started
alter table pipeline_runs add column has_knowledge boolean not null default false;

-- Quick flag on projects
alter table projects add column has_knowledge boolean not null default false;
