-- Migration: Storage Bucket Configuration
-- Version: 002
-- Date: 2026-10-01
-- Description: Configure Supabase Storage policies for Rendered-videos bucket

-- =============================================================================
-- PREREQUISITES
-- =============================================================================
-- 1. Bucket "Rendered-videos" must already exist (created via Supabase Dashboard)
-- 2. Bucket should be PUBLIC for CDN access
-- 3. File size limit: 50 MB recommended
-- 4. Allowed MIME types: video/mp4

-- =============================================================================
-- STORAGE POLICIES (Correct RLS Policy Syntax)
-- =============================================================================

-- Policy 1: Authenticated users can upload their own generation videos
-- Only allows upload if the filename (without extension) matches a generation_id owned by the user
CREATE POLICY "Users can upload their own generation videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'Rendered-videos' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM generations WHERE user_id = auth.uid()
  )
);

-- Policy 2: Public read access to all videos (CDN delivery)
CREATE POLICY "Public read access to all videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'Rendered-videos');

-- Policy 3: Users can delete their own videos
CREATE POLICY "Users can delete their own videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'Rendered-videos' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM generations WHERE user_id = auth.uid()
  )
);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if policies were created
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- List all files in bucket (for testing)
-- SELECT * FROM storage.objects WHERE bucket_id = 'Rendered-videos';

-- =============================================================================
-- MANUAL TESTING FROM BACKEND
-- =============================================================================

-- Test upload (Python):
-- from db.supabase_bucket import upload_file_to_bucket, public_file_url
-- upload_file_to_bucket('Rendered-videos', 'test.mp4', 'test-uuid.mp4')
-- url = public_file_url('Rendered-videos', 'test-uuid.mp4')
-- print(url)  # Should return: https://<project>.supabase.co/storage/v1/object/public/Rendered-videos/test-uuid.mp4

-- =============================================================================
-- CLEANUP (For testing)
-- =============================================================================

-- Delete test files:
-- DELETE FROM storage.objects WHERE bucket_id = 'Rendered-videos' AND name = 'test-uuid.mp4';

-- Drop policies (if you need to recreate them):
-- DROP POLICY IF EXISTS "Users can upload their own generation videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Public read access to all videos" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete their own videos" ON storage.objects;
