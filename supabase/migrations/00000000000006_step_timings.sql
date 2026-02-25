alter table pipeline_runs add column step_timings jsonb not null default '{}'::jsonb;
