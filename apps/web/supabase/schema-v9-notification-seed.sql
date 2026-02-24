-- =============================================
-- Schema v9: Seed notification preferences for testing
-- Seeds Jordan & Katie's WhatsApp numbers for Twilio testing
-- =============================================

-- Jordan's WhatsApp preferences
INSERT INTO public.user_preferences (user_id, whatsapp_number, whatsapp_enabled, timezone)
SELECT id, '+351925803387', true, 'Europe/Lisbon'
FROM public.users WHERE email = 'jordan@digitalonda.com'
ON CONFLICT (user_id) DO UPDATE SET
  whatsapp_number = '+351925803387',
  whatsapp_enabled = true,
  timezone = 'Europe/Lisbon';

-- Katie's WhatsApp preferences
INSERT INTO public.user_preferences (user_id, whatsapp_number, whatsapp_enabled, timezone)
SELECT id, '+351925803413', true, 'Europe/Lisbon'
FROM public.users WHERE email = 'katie@digitalonda.com'
ON CONFLICT (user_id) DO UPDATE SET
  whatsapp_number = '+351925803413',
  whatsapp_enabled = true,
  timezone = 'Europe/Lisbon';
