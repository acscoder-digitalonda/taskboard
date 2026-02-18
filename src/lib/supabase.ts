import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl.startsWith("http") && !!supabaseAnonKey;

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    // Return a dummy client during build / when env vars aren't set.
    // All runtime calls will fail gracefully until real credentials are provided.
    console.warn("Supabase not configured — using placeholder client");
    return createClient("https://placeholder.supabase.co", "placeholder");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = createSupabaseClient();
