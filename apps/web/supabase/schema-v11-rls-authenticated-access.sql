-- schema-v11-rls-authenticated-access.sql
-- Allow authenticated users to perform cross-user notification operations
-- (e.g., creating notifications for others, reading push subscriptions to deliver pushes).
-- This eliminates the need for SUPABASE_SERVICE_ROLE_KEY in most API routes.

-- ═══════════════════════════════════════════════════
-- push_subscriptions: allow any authenticated user to SELECT
-- (needed by sendPushToUser to deliver push notifications to other users)
-- INSERT/UPDATE/DELETE remain restricted to own rows via existing policy.
-- ═══════════════════════════════════════════════════
CREATE POLICY "authenticated_can_read_push_subs"
  ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- notifications: allow any authenticated user to INSERT
-- (needed by send route to create notifications for other users)
-- SELECT/UPDATE/DELETE remain restricted to own rows.
-- ═══════════════════════════════════════════════════
CREATE POLICY "authenticated_can_insert_notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow authenticated users to UPDATE notifications they created for others
-- (needed to mark notification as delivered via push/whatsapp)
CREATE POLICY "authenticated_can_update_notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- user_preferences: allow any authenticated user to SELECT
-- (needed by send route to check notification preferences & quiet hours)
-- INSERT/UPDATE/DELETE remain restricted to own rows.
-- ═══════════════════════════════════════════════════
CREATE POLICY "authenticated_can_read_user_preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════
-- users: allow any authenticated user to SELECT
-- (needed by send route to look up phone numbers for WhatsApp,
--  and by test route to look up users by email)
-- ═══════════════════════════════════════════════════
CREATE POLICY "authenticated_can_read_users"
  ON public.users
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
