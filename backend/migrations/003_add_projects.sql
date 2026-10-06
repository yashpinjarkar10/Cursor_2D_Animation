-- =============================================================================
-- Migration 003: Add Projects table and link Chats to Projects
-- Run this in the Supabase SQL Editor BEFORE starting the v4.0 backend.
-- =============================================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- -----------------------------------------------------------------------------
-- 1. projects table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON projects (user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_projects_updated_at ON projects;
CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 2. Add project_id column to chats
-- -----------------------------------------------------------------------------

-- Add column as nullable first so existing rows don't fail
ALTER TABLE chats
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_chats_project_id ON chats (project_id);

-- Add updated_at trigger to chats if not already present
DROP TRIGGER IF EXISTS set_chats_updated_at ON chats;
CREATE TRIGGER set_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- -----------------------------------------------------------------------------
-- 3. Row Level Security — projects
-- -----------------------------------------------------------------------------

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_own ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY projects_insert_own ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_update_own ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY projects_delete_own ON projects
    FOR DELETE USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 4. Update chats RLS — restrict list to user's own chats
--    (already scoped by user_id; no change needed beyond existing policies)
-- -----------------------------------------------------------------------------

-- If you previously had SELECT policy on chats referencing only user_id,
-- add a project_id scope check here:
DROP POLICY IF EXISTS chats_select_own ON chats;
CREATE POLICY chats_select_own ON chats
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chats_insert_own ON chats;
CREATE POLICY chats_insert_own ON chats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chats_update_own ON chats;
CREATE POLICY chats_update_own ON chats
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS chats_delete_own ON chats;
CREATE POLICY chats_delete_own ON chats
    FOR DELETE USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 5. Backfill: create a default project for any existing chats with no project
--    (safe to run even if there are no existing rows)
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    orphaned RECORD;
    new_project_id UUID;
BEGIN
    FOR orphaned IN
        SELECT DISTINCT user_id FROM chats WHERE project_id IS NULL
    LOOP
        -- Create a "Default Project" for this user
        INSERT INTO projects (user_id, name, description)
        VALUES (orphaned.user_id, 'Default Project', 'Auto-created during v4.0 migration')
        RETURNING id INTO new_project_id;

        -- Assign all orphaned chats to the new project
        UPDATE chats SET project_id = new_project_id
        WHERE user_id = orphaned.user_id AND project_id IS NULL;
    END LOOP;
END;
$$;


-- -----------------------------------------------------------------------------
-- 6. Now enforce NOT NULL on project_id (after backfill)
-- -----------------------------------------------------------------------------

ALTER TABLE chats ALTER COLUMN project_id SET NOT NULL;


-- =============================================================================
-- Verification
-- =============================================================================

-- Run these SELECTs to confirm everything looks right:
--
--   SELECT * FROM projects LIMIT 5;
--   SELECT id, project_id, user_id, title FROM chats LIMIT 5;
--   SELECT COUNT(*) FROM chats WHERE project_id IS NULL;  -- should be 0
