-- =============================================
-- Schema v8: Email allow list
-- Replace domain-based whitelist with per-email allow list
-- =============================================

-- Table to store allowed email addresses
-- Only emails in this table can sign in to TaskBoard
CREATE TABLE IF NOT EXISTS public.allowed_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  added_by TEXT,          -- who added this email (for audit)
  notes TEXT,             -- optional note (e.g. "freelance designer")
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast lookups during sign-in
CREATE INDEX IF NOT EXISTS idx_allowed_emails_email ON public.allowed_emails (email);

-- Enable RLS (read-only for authenticated users, admin manages via SQL/API)
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read the allow list (needed for client-side auth check)
CREATE POLICY "Allow authenticated read" ON public.allowed_emails
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access (for API management)
CREATE POLICY "Service role full access" ON public.allowed_emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Seed: Add existing team members' emails
-- Run this after creating the table, adjust emails as needed
-- =============================================
-- INSERT INTO public.allowed_emails (email, added_by, notes) VALUES
--   ('jordan@digitalonda.com', 'system', 'founder'),
--   ('someone@digitalonda.com', 'system', 'team member')
-- ON CONFLICT (email) DO NOTHING;
