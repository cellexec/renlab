-- Add type column to specifications
ALTER TABLE specifications
  ADD COLUMN type text NOT NULL DEFAULT 'feature'
  CONSTRAINT chk_specification_type CHECK (type IN ('feature', 'ui-refactor'));

-- Design runs table
CREATE TABLE design_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  specification_id     uuid NOT NULL REFERENCES specifications(id) ON DELETE CASCADE,
  spec_version_id      uuid NOT NULL REFERENCES specification_versions(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','parent_worktree','generating',
                         'merging_variants','installing','dev_server','awaiting_review',
                         'finalizing','merging_final','success','failed','cancelled')),
  current_step         text CHECK (current_step IN ('parent_worktree','generating',
                         'merging_variants','installing','dev_server','awaiting_review',
                         'finalizing','merging_final')),
  parent_branch        text,
  parent_worktree_path text,
  dev_server_port      integer,
  variant_count        integer NOT NULL DEFAULT 2,
  target_path          text,
  error_message        text,
  logs                 jsonb NOT NULL DEFAULT '[]',
  step_timings         jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  finished_at          timestamptz
);

ALTER TABLE design_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON design_runs FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE design_runs;

-- Design variants table
CREATE TABLE design_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_run_id   uuid NOT NULL REFERENCES design_runs(id) ON DELETE CASCADE,
  variant_number  integer NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','generating','merging','merged','failed')),
  branch_name     text,
  worktree_path   text,
  brief           text,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  CONSTRAINT uq_design_variant UNIQUE (design_run_id, variant_number)
);

ALTER TABLE design_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON design_variants FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE design_variants;
CREATE INDEX idx_design_variants_run ON design_variants(design_run_id);
