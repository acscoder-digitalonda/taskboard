-- ============================================
-- TaskBoard V2 — Messaging, Files, Search, Notifications
-- Run this AFTER the original schema.sql
-- ============================================

-- Extend task_source enum for new sources
ALTER TYPE task_source ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE task_source ADD VALUE IF NOT EXISTS 'openclaw';

-- ============================================
-- Channels (like Slack channels / group chats)
-- ============================================
CREATE TYPE channel_type AS ENUM ('public', 'private', 'direct');

CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,                          -- null for DMs
  description TEXT,
  type channel_type NOT NULL DEFAULT 'public',
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Channel Members
-- ============================================
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.channel_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  last_read_at TIMESTAMPTZ DEFAULT now(),
  muted BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- ============================================
-- Messages
-- ============================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_system BOOLEAN DEFAULT FALSE,
  is_ai BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',       -- for rich content: links, embeds, task refs
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Full-text search vector
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(body, ''))
  ) STORED
);

-- ============================================
-- Message Reactions
-- ============================================
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- ============================================
-- File Attachments (Supabase Storage references)
-- ============================================
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,         -- path in Supabase Storage bucket
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES public.users(id),
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Full-text search on file names
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, ''))
  ) STORED
);

-- ============================================
-- Notifications
-- ============================================
CREATE TYPE notification_type AS ENUM (
  'task_assigned', 'task_updated', 'task_completed',
  'mention', 'dm', 'channel_message',
  'checkin_due', 'agent_report', 'email_ingested'
);

CREATE TYPE notification_channel AS ENUM ('in_app', 'whatsapp', 'email');

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                          -- deep link within app
  read_at TIMESTAMPTZ,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  delivered_at TIMESTAMPTZ,           -- when sent via whatsapp/email
  reference_id UUID,                  -- task_id, message_id, etc.
  reference_type TEXT,                -- 'task', 'message', 'channel'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- AI Summaries (avoids infinite context costs)
-- ============================================
CREATE TABLE public.summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type TEXT NOT NULL,          -- 'channel', 'project', 'task', 'email_thread'
  source_id UUID NOT NULL,            -- channel_id, project_id, task_id
  summary TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  message_range_start TIMESTAMPTZ,    -- first message covered
  message_range_end TIMESTAMPTZ,      -- last message covered
  message_count INTEGER,
  generated_by TEXT DEFAULT 'openclaw',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- OpenClaw Agent Activity Log
-- ============================================
CREATE TABLE public.agent_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name TEXT NOT NULL DEFAULT 'openclaw',
  action TEXT NOT NULL,               -- 'email_read', 'task_created', 'summary_generated', etc.
  description TEXT NOT NULL,
  source_email TEXT,                   -- original email address if from email
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- User Preferences (notification settings, etc.)
-- ============================================
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_number TEXT,
  whatsapp_enabled BOOLEAN DEFAULT FALSE,
  email_notifications BOOLEAN DEFAULT TRUE,
  notify_task_assigned BOOLEAN DEFAULT TRUE,
  notify_mentions BOOLEAN DEFAULT TRUE,
  notify_dm BOOLEAN DEFAULT TRUE,
  notify_agent_reports BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'America/New_York',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Full-text search on tasks (add to existing table)
-- ============================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(client, '') || ' ' ||
      coalesce(array_to_string(notes, ' '), '')
    )
  ) STORED;

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_channels_type ON public.channels(type);
CREATE INDEX idx_channels_project ON public.channels(project_id);
CREATE INDEX idx_channel_members_user ON public.channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON public.channel_members(channel_id);
CREATE INDEX idx_messages_channel ON public.messages(channel_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_messages_search ON public.messages USING GIN(search_vector);
CREATE INDEX idx_files_channel ON public.files(channel_id);
CREATE INDEX idx_files_task ON public.files(task_id);
CREATE INDEX idx_files_project ON public.files(project_id);
CREATE INDEX idx_files_search ON public.files USING GIN(search_vector);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_summaries_source ON public.summaries(source_type, source_id);
CREATE INDEX idx_agent_activity_created ON public.agent_activity(created_at DESC);
CREATE INDEX idx_tasks_search ON public.tasks USING GIN(search_vector);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Channels: members can read, authenticated can create
CREATE POLICY "Members can read channels" ON public.channels FOR SELECT
  USING (
    type = 'public' OR
    EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = channels.id AND user_id = auth.uid())
  );
CREATE POLICY "Authenticated can create channels" ON public.channels FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Owner/admin can update channels" ON public.channels FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = channels.id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Channel Members
CREATE POLICY "Members can read members" ON public.channel_members FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can join" ON public.channel_members FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own membership" ON public.channel_members FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "Users can leave" ON public.channel_members FOR DELETE
  USING (user_id = auth.uid());

-- Messages: channel members can read/write
CREATE POLICY "Channel members can read messages" ON public.messages FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "Channel members can send messages" ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
  );
CREATE POLICY "Authors can edit own messages" ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

-- Message Reactions
CREATE POLICY "Channel members can read reactions" ON public.message_reactions FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can react" ON public.message_reactions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can remove own reactions" ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Files
CREATE POLICY "Authenticated can read files" ON public.files FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can upload files" ON public.files FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Notifications: users see their own
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can mark own as read" ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Summaries: all authenticated can read
CREATE POLICY "Authenticated can read summaries" ON public.summaries FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can create summaries" ON public.summaries FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Agent Activity: all authenticated can read
CREATE POLICY "Authenticated can read agent activity" ON public.agent_activity FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can log agent activity" ON public.agent_activity FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- User Preferences: users manage their own
CREATE POLICY "Users read own prefs" ON public.user_preferences FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users insert own prefs" ON public.user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own prefs" ON public.user_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity;

-- ============================================
-- Supabase Storage Bucket (run via dashboard or REST API)
-- Creates a 'files' bucket for file uploads
-- ============================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', false);
-- Storage policies are managed via Supabase dashboard
