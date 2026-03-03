-- Monorepo support: add repo_path to projects
-- For monorepo apps, repo_path stores the git root (shared across apps).
-- For single-repo projects, repo_path is null.

alter table projects add column repo_path text;
