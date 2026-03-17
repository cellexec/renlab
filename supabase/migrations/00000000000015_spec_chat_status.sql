-- Add 'chat' status to specifications for in-progress chat sessions
alter table specifications drop constraint chk_specification_status;
alter table specifications add constraint chk_specification_status
  check (status in ('chat', 'draft', 'pipeline', 'failed', 'cancelled', 'done'));
