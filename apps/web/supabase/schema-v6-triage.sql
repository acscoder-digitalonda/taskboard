-- ============================================================
-- Schema V6: Email Triage, Project Context, Role-Based Routing
-- ============================================================

-- 1. Add role to users (design, strategy, development, pm, agent, member)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 2. Project context docs (structured knowledge base per project)
CREATE TABLE IF NOT EXISTS public.project_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'strategy_brief', 'brand_guidelines', 'decision_log',
    'client_preferences', 'meeting_notes', 'agent_config'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_context_project ON public.project_context(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_type ON public.project_context(doc_type);

ALTER TABLE public.project_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage project context"
  ON public.project_context FOR ALL
  USING (true) WITH CHECK (true);

-- 3. Triage metadata on email_drafts
ALTER TABLE public.email_drafts
  ADD COLUMN IF NOT EXISTS triage_category TEXT,
  ADD COLUMN IF NOT EXISTS triage_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS triage_confidence REAL,
  ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- 4. Email linkage on tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS email_draft_id UUID REFERENCES public.email_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_email_id TEXT;

-- 5. PM notification trigger on task status change
CREATE OR REPLACE FUNCTION notify_pm_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, channel, reference_id, reference_type)
    SELECT u.id, 'task_updated',
      'Task moved to ' || NEW.status,
      NEW.title,
      '/tasks/' || NEW.id,
      'in_app',
      NEW.id::text,
      'task'
    FROM public.users u WHERE u.role = 'pm';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_status_change_notify ON public.tasks;
CREATE TRIGGER task_status_change_notify
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION notify_pm_on_status_change();

-- 6. Enable realtime for project_context
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_context;
