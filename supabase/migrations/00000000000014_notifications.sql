-- Notifications table
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  project_id  uuid references projects(id) on delete cascade,
  type        text not null
              check (type in ('pipeline_succeeded','pipeline_failed','pipeline_stopped','human_interaction_needed')),
  title       text not null,
  body        text,
  link        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  metadata    jsonb default '{}'::jsonb
);

alter table notifications enable row level security;
create policy "allow all" on notifications for all using (true) with check (true);
alter publication supabase_realtime add table notifications;
