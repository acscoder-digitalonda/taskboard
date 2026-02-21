-- ============================================
-- V4: Gmail Integration — Email Drafts
-- ============================================

-- email_drafts: Stores AI-generated and manual email drafts
-- Katie reviews/edits, then sends via Gmail API
CREATE TABLE IF NOT EXISTS public.email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,

  -- Email envelope
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,

  -- Reply threading
  in_reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  gmail_thread_id TEXT,
  gmail_message_id TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'sent', 'failed')),
  generated_by TEXT DEFAULT 'ai',   -- 'ai' | 'manual'
  edited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- Send tracking
  sent_at TIMESTAMPTZ,
  sent_gmail_id TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_drafts_channel ON public.email_drafts(channel_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_project ON public.email_drafts(project_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON public.email_drafts(status);

-- RLS
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage email drafts"
  ON public.email_drafts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Dev bypass (same pattern as other tables)
CREATE POLICY "Dev bypass email_drafts"
  ON public.email_drafts FOR ALL
  USING (true) WITH CHECK (true);

-- Add client_emails to projects for reliable email→project matching
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_emails TEXT[] DEFAULT '{}';

-- Enable realtime for email_drafts
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_drafts;
