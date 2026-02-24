-- v12: Task Groups — save original input and group tasks created from it
-- Enables multi-task parsing: 1 input → N tasks, tracked as a group

CREATE TABLE public.task_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_input TEXT NOT NULL,
  created_by_id UUID REFERENCES public.users(id) NOT NULL,
  created_via TEXT NOT NULL DEFAULT 'app_chat',
  task_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Link tasks to their group
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.task_groups(id);

-- Indexes for efficient lookups
CREATE INDEX idx_tasks_group ON public.tasks(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_task_groups_created_by ON public.task_groups(created_by_id);

-- RLS: team-wide read + authenticated insert
ALTER TABLE public.task_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read task_groups" ON public.task_groups
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated insert task_groups" ON public.task_groups
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
