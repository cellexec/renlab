-- Add logs column to pipeline_runs for persistence across server restarts
alter table pipeline_runs add column logs jsonb not null default '[]'::jsonb;
