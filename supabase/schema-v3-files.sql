-- ============================================================
-- TaskBoard V3: File Storage Upgrade + Dev Bypass RLS Fixes
-- Adds delete/update RLS policies for files table
-- Adds storage bucket policies for file management
-- Adds dev bypass policies for tasks, projects, users tables
-- ============================================================

-- ── Files table: delete/update policies ─────────────────────

CREATE POLICY "Authenticated can delete files" ON public.files
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update files" ON public.files
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Dev bypass policies for files (permissive, for local dev without auth)
CREATE POLICY dev_bypass_files_delete ON public.files
  FOR DELETE USING (true);

CREATE POLICY dev_bypass_files_update ON public.files
  FOR UPDATE USING (true) WITH CHECK (true);

-- ── Storage bucket: dev bypass policies ─────────────────────
-- Applied to storage.objects for bucket_id = 'files'

CREATE POLICY dev_bypass_storage_select ON storage.objects
  FOR SELECT USING (bucket_id = 'files');

CREATE POLICY dev_bypass_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'files');

CREATE POLICY dev_bypass_storage_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'files') WITH CHECK (bucket_id = 'files');

CREATE POLICY dev_bypass_storage_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'files');

-- ── Core tables: dev bypass RLS policies ────────────────────
-- These allow the anon key to read/write all data during local dev.
-- IMPORTANT: Remove these when Google Auth is configured!

-- Tasks
CREATE POLICY dev_bypass_tasks_select ON public.tasks
  FOR SELECT USING (true);

CREATE POLICY dev_bypass_tasks_insert ON public.tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY dev_bypass_tasks_update ON public.tasks
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY dev_bypass_tasks_delete ON public.tasks
  FOR DELETE USING (true);

-- Projects
CREATE POLICY dev_bypass_projects_select ON public.projects
  FOR SELECT USING (true);

CREATE POLICY dev_bypass_projects_insert ON public.projects
  FOR INSERT WITH CHECK (true);

CREATE POLICY dev_bypass_projects_update ON public.projects
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY dev_bypass_projects_delete ON public.projects
  FOR DELETE USING (true);

-- Users
CREATE POLICY dev_bypass_users_select ON public.users
  FOR SELECT USING (true);

CREATE POLICY dev_bypass_users_insert ON public.users
  FOR INSERT WITH CHECK (true);

CREATE POLICY dev_bypass_users_update ON public.users
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY dev_bypass_users_delete ON public.users
  FOR DELETE USING (true);
