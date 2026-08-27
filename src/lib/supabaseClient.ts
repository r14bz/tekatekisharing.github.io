import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  // Prioritas: env Vite → localStorage (sama seperti AdminService)
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    localStorage.getItem('tts_supabase_url') ||
    '';
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    localStorage.getItem('tts_supabase_key') ||
    '';

  if (!url || !key) return null;

  if (!client) {
    client = createClient(url, key, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
  }
  return client;
}