-- ============================================================
-- TaskBoard V3: File Storage Upgrade
-- Adds delete/update RLS policies for files table
-- Adds storage bucket policies for file management
-- ============================================================

-- Delete policy on files table
CREATE POLICY "Authenticated can delete files" ON public.files
  FOR DELETE USING (auth.role() = 'authenticated');

-- Update policy on files table (for renaming, re-assigning)
CREATE POLICY "Authenticated can update files" ON public.files
  FOR UPDATE USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Dev bypass policies (permissive, for local dev without auth)
CREATE POLICY "dev_bypass_files_delete" ON public.files
  FOR DELETE USING (true);

CREATE POLICY "dev_bypass_files_update" ON public.files
  FOR UPDATE USING (true) WITH CHECK (true);

-- Storage bucket policies (applied via Supabase Dashboard or API):
--
-- Bucket: "files" (private)
--
-- Policy: "Allow authenticated uploads"
--   Operation: INSERT
--   Policy: (auth.role() = 'authenticated') OR true  -- true for dev bypass
--
-- Policy: "Allow authenticated reads"
--   Operation: SELECT
--   Policy: (auth.role() = 'authenticated') OR true
--
-- Policy: "Allow authenticated deletes"
--   Operation: DELETE
--   Policy: (auth.role() = 'authenticated') OR true
