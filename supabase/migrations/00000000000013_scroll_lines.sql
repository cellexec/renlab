-- Add scroll_lines setting to projects (lines to scroll per j/k press in view mode)
alter table projects add column scroll_lines integer not null default 5;
