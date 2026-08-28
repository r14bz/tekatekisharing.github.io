import { getBrowserSupabase } from "../lib/supabaseClient";
import { invalidateMemoryCache } from "./cloudService";

type RealtimeHandlers = {
  onPuzzleChange?: (payload: any) => void;
  onLeaderboardChange?: (payload: any) => void;
};

let channel: ReturnType<
  NonNullable<ReturnType<typeof getBrowserSupabase>>["channel"]
> | null = null;

/**
 * Subscribe ke perubahan tabel Supabase (Realtime).
 * Syarat agar aktif di production:
 * 1. Realtime enabled di tabel puzzles & leaderboard (Dashboard → Database → Replication)
 * 2. VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY di env Vercel (Build)
 * 3. RLS mengizinkan SELECT untuk role anon (atau authenticated) pada tabel tersebut
 */
export function startRealtime(handlers: RealtimeHandlers = {}) {
  const sb = getBrowserSupabase();
  if (!sb) {
    console.warn(
      "[Realtime] Client tidak tersedia. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Vercel, lalu redeploy."
    );
    return () => {};
  }

  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  channel = sb
    .channel("tts-public")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "puzzles" },
      (payload) => {
        invalidateMemoryCache("community-puzzles", "puzzle-");
        handlers.onPuzzleChange?.(payload);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "leaderboard" },
      (payload) => {
        invalidateMemoryCache("leaderboard-");
        handlers.onLeaderboardChange?.(payload);
      }
    )
    .subscribe((status) => {
      console.log("[Realtime] status:", status);
      if (status === "CHANNEL_ERROR") {
        console.warn(
          "[Realtime] Gagal subscribe. Cek: Replication aktif, anon key benar, dan RLS SELECT untuk anon."
        );
      }
    });

  return () => {
    if (channel && sb) {
      sb.removeChannel(channel);
      channel = null;
    }
  };
}
