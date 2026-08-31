import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
// Ingat kredensial yang dipakai untuk membuat client saat ini, supaya kita
// tahu kapan harus membuat ulang (misal setelah admin mengganti Supabase
// URL/key lewat localStorage) alih-alih terus memakai client basi.
let cachedUrl = '';
let cachedKey = '';

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

  if (!client || url !== cachedUrl || key !== cachedKey) {
    client = createClient(url, key, {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
    cachedUrl = url;
    cachedKey = key;
  }
  return client;
}