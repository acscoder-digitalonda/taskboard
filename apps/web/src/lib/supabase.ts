import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl.startsWith("http") && !!supabaseAnonKey;

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // L8: Clearer warning during build / when env vars aren't set.
    console.warn(
      "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local. " +
      "Using placeholder client — all DB calls will fail."
    );
    return createClient("https://placeholder.supabase.co", "placeholder");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = createSupabaseClient();
