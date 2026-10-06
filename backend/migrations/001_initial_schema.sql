-- Migration: Initial Production Schema
-- Version: 001
-- Date: 2026-10-01
-- Description: Multi-tenant architecture with users, chats, and generations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE (Metadata for Supabase Auth users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'User metadata synchronized with Supabase Auth';
COMMENT ON COLUMN users.id IS 'References auth.users(id) from Supabase Auth';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- CHATS TABLE (Conversation sessions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE chats IS 'Chat sessions for organizing animation generations';
COMMENT ON COLUMN chats.user_id IS 'Owner of this chat session';

CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- GENERATIONS TABLE (Animation generation requests and results)
-- =============================================================================
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Input parameters
  query TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'create',
  duration FLOAT,
  aspect_ratio TEXT DEFAULT '16:9',
  quality TEXT DEFAULT 'low',
  voiceover_enabled BOOLEAN DEFAULT FALSE,
  project_context JSONB,
  
  -- Generated output
  generated_code TEXT,
  video_url TEXT,
  video_storage_path TEXT,  -- Storage path: {generation_id}.mp4
  
  -- Scene metadata
  scene_class TEXT,
  scene_plan JSONB,
  capability_plan JSONB,
  retrieval_trace JSONB,
  implementation_plan JSONB,
  
  -- Execution metadata
  attempt_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  failure_type TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  CONSTRAINT valid_mode CHECK (mode IN ('create', 'modify', 'extend', 'remove', 'restructure')),
  CONSTRAINT valid_quality CHECK (quality IN ('low', 'medium', 'high'))
);

COMMENT ON TABLE generations IS 'Animation generation requests with full provenance tracking';
COMMENT ON COLUMN generations.query IS 'User''s natural language request';
COMMENT ON COLUMN generations.video_url IS 'Public CDN URL from Supabase Storage';
COMMENT ON COLUMN generations.status IS 'Current state: pending → processing → success/failed';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_generations_chat_id ON generations(chat_id);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_video_url ON generations(video_url) WHERE video_url IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

-- Users: Can only see their own profile
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY users_insert_own ON users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (auth.uid() = id);

-- Chats: Full CRUD for own chats only
CREATE POLICY chats_select_own ON chats
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY chats_insert_own ON chats
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY chats_update_own ON chats
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY chats_delete_own ON chats
  FOR DELETE
  USING (auth.uid() = user_id);

-- Generations: Read-only for users, write from service role
CREATE POLICY generations_select_own ON generations
  FOR SELECT
  USING (auth.uid() = user_id);

-- Note: INSERT/UPDATE for generations will use service_role key from backend
-- This prevents clients from forging generation data

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Get chat with generation counts
CREATE OR REPLACE FUNCTION get_chat_with_stats(p_chat_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  generations_count BIGINT,
  last_generation_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.user_id,
    c.title,
    c.created_at,
    c.updated_at,
    COUNT(g.id) AS generations_count,
    MAX(g.created_at) AS last_generation_at
  FROM chats c
  LEFT JOIN generations g ON g.chat_id = c.id
  WHERE c.id = p_chat_id
  GROUP BY c.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's recent generations
CREATE OR REPLACE FUNCTION get_recent_generations(p_user_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE (
  id UUID,
  chat_id UUID,
  query TEXT,
  video_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    g.id,
    g.chat_id,
    g.query,
    g.video_url,
    g.status,
    g.created_at
  FROM generations g
  WHERE g.user_id = p_user_id
  ORDER BY g.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- GRANTS (Service role has full access, anon/authenticated limited by RLS)
-- =============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant access to tables
GRANT SELECT ON users TO authenticated;
GRANT INSERT, UPDATE ON users TO authenticated;

GRANT ALL ON chats TO authenticated;
GRANT ALL ON generations TO authenticated;

-- Grant access to sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================================================
-- SEED DATA (Optional - for development)
-- =============================================================================

-- Example: Create a test user (in production, users come from Supabase Auth)
-- INSERT INTO users (id, email, display_name) 
-- VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test User')
-- ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- To verify migration:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
-- SELECT * FROM users;
-- SELECT * FROM chats;
-- SELECT * FROM generations;
