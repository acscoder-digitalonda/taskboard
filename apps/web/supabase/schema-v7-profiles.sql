-- v7: User profiles — add description column for user bios
-- Run: psql or Supabase SQL Editor

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS description TEXT;

-- Ensure role column exists (was added in v6 but being explicit)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
