-- v13: Add UPDATE policy for public.users
-- The dev_bypass policies were dropped in v5 but never replaced with proper
-- authenticated policies. This allows team members to update user profiles
-- (role, description) needed for AI smart task assignment.

CREATE POLICY "Authenticated users can update users"
  ON public.users FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
