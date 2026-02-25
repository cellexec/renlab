-- Add status column to specifications
alter table specifications
  add column status text not null default 'draft'
  constraint chk_specification_status check (status in ('draft', 'pipeline', 'failed', 'cancelled', 'done'));
