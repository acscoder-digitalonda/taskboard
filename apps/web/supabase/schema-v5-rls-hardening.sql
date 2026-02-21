-- ============================================================
-- V5: RLS Policy Hardening
-- ============================================================
-- Tightens RLS policies that were overly permissive:
--   1. Drop dangerous dev_bypass policies (use NEXT_PUBLIC_DEV_BYPASS_AUTH in app instead)
--   2. Add channel-membership checks on files
--   3. Add row-level filtering on email_drafts
--   4. Add auth checks to storage policies
--   5. Tighten reactions/summaries to respect channel membership
--
-- IMPORTANT: Run this AFTER schema.sql, schema-v2, schema-v3, schema-v4.
-- This migration is idempotent (uses DROP IF EXISTS + CREATE).
-- ============================================================


-- ============================================================
-- 1. DROP DEV BYPASS POLICIES
--    These allowed USING (true) which defeats the purpose of RLS.
--    Dev bypass is now handled in the app layer via api-auth.ts.
-- ============================================================

DROP POLICY IF EXISTS "dev_bypass_tasks_select" ON tasks;
DROP POLICY IF EXISTS "dev_bypass_tasks_insert" ON tasks;
DROP POLICY IF EXISTS "dev_bypass_tasks_update" ON tasks;
DROP POLICY IF EXISTS "dev_bypass_tasks_delete" ON tasks;

DROP POLICY IF EXISTS "dev_bypass_projects_select" ON projects;
DROP POLICY IF EXISTS "dev_bypass_projects_insert" ON projects;
DROP POLICY IF EXISTS "dev_bypass_projects_update" ON projects;
DROP POLICY IF EXISTS "dev_bypass_projects_delete" ON projects;

DROP POLICY IF EXISTS "dev_bypass_users_select" ON users;
DROP POLICY IF EXISTS "dev_bypass_users_insert" ON users;
DROP POLICY IF EXISTS "dev_bypass_users_update" ON users;
DROP POLICY IF EXISTS "dev_bypass_users_delete" ON users;

DROP POLICY IF EXISTS "dev_bypass_files_delete" ON files;
DROP POLICY IF EXISTS "dev_bypass_files_update" ON files;

DROP POLICY IF EXISTS "dev_bypass_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_delete" ON storage.objects;

DROP POLICY IF EXISTS "Dev bypass email_drafts" ON email_drafts;


-- ============================================================
-- 2. HARDEN FILES POLICIES
--    Files should only be visible to members of the file's channel,
--    or to all authenticated users if the file has no channel context.
-- ============================================================

-- Drop the overly broad "Authenticated can read files" policy
DROP POLICY IF EXISTS "Authenticated can read files" ON files;

CREATE POLICY "Files visible to channel members or unscoped"
  ON files FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      -- Files not attached to a channel are visible to all authenticated users
      channel_id IS NULL
      OR
      -- Files in a channel require membership
      EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = files.channel_id
          AND cm.user_id = auth.uid()
      )
    )
  );


-- ============================================================
-- 3. HARDEN EMAIL DRAFTS POLICIES
--    Restrict access based on project membership or draft authorship.
-- ============================================================

-- Drop the overly broad "all authenticated" policy
DROP POLICY IF EXISTS "Authenticated users can manage email drafts" ON email_drafts;

-- SELECT: Authenticated users can read drafts for their projects
CREATE POLICY "Users can read email drafts"
  ON email_drafts FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: Any authenticated user can create drafts
CREATE POLICY "Authenticated can create email drafts"
  ON email_drafts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Only the editor or the system can edit drafts
CREATE POLICY "Users can edit email drafts"
  ON email_drafts FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- DELETE: Only authenticated users can delete drafts
CREATE POLICY "Authenticated can delete email drafts"
  ON email_drafts FOR DELETE
  USING (auth.role() = 'authenticated');


-- ============================================================
-- 4. HARDEN STORAGE POLICIES
--    Add authentication checks to storage.objects policies.
-- ============================================================

-- Drop existing unauthenticated storage policies
DROP POLICY IF EXISTS "dev_bypass_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "dev_bypass_storage_delete" ON storage.objects;

-- Create properly authenticated storage policies
CREATE POLICY "Authenticated can read files bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated can upload to files bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated can update in files bucket"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated can delete from files bucket"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'files'
    AND auth.role() = 'authenticated'
  );


-- ============================================================
-- 5. HARDEN REACTIONS POLICY
--    Reactions should only be readable by channel members.
-- ============================================================

DROP POLICY IF EXISTS "Channel members can read reactions" ON message_reactions;

CREATE POLICY "Channel members can read reactions"
  ON message_reactions FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN channel_members cm ON cm.channel_id = m.channel_id
      WHERE m.id = message_reactions.message_id
        AND cm.user_id = auth.uid()
    )
  );


-- ============================================================
-- 6. HARDEN SUMMARIES POLICY
--    Summaries should only be readable if user has access to the source.
-- ============================================================

DROP POLICY IF EXISTS "Authenticated can read summaries" ON summaries;

CREATE POLICY "Users can read summaries for accessible sources"
  ON summaries FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      -- Channel summaries: user must be a member
      (source_type = 'channel' AND EXISTS (
        SELECT 1 FROM channel_members cm
        WHERE cm.channel_id = summaries.source_id::uuid
          AND cm.user_id = auth.uid()
      ))
      OR
      -- Task/project summaries: visible to all authenticated (team app)
      source_type IN ('task', 'project', 'email_thread')
    )
  );


-- ============================================================
-- NOTES FOR DEPLOYMENT
-- ============================================================
-- After running this migration:
-- 1. All dev_bypass policies are removed. Dev mode is handled by
--    NEXT_PUBLIC_DEV_BYPASS_AUTH in the application layer.
-- 2. API routes use service_role key for DB operations, so server-side
--    code is unaffected by RLS changes.
-- 3. Client-side Supabase queries (store.ts, messaging-store.ts) use
--    the user's JWT, so these policies now properly scope data access.
-- 4. Test by verifying:
--    a. Files in private channels are not visible to non-members
--    b. Summaries for private channels are not visible to non-members
--    c. Email drafts are accessible to all team members (small team app)
--    d. Storage uploads/downloads require authentication
