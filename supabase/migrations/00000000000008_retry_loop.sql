-- Add max_retries to projects
alter table projects add column max_retries integer not null default 2;

-- Add iterations and max_retries to pipeline_runs
alter table pipeline_runs add column iterations integer not null default 1;
alter table pipeline_runs add column max_retries integer not null default 0;

-- Update status check constraint to include 'rejected'
alter table pipeline_runs drop constraint pipeline_runs_status_check;
alter table pipeline_runs add constraint pipeline_runs_status_check
  check (status in ('pending','worktree','coding','reviewing','merging','success','failed','cancelled','rejected'));
