-- v11: Add phone column to users table
-- Phone number for general contact / WhatsApp delivery
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
