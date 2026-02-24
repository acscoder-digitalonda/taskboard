-- =============================================
-- Schema v10: Push notification subscriptions
-- Stores Web Push API subscriptions per user/device
-- =============================================

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- One subscription per browser endpoint
CREATE UNIQUE INDEX push_sub_endpoint_idx ON public.push_subscriptions(endpoint);

-- Index for fast lookup by user when sending notifications
CREATE INDEX push_sub_user_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "users_own_push_subs" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
