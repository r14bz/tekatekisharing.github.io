import { getBrowserSupabase } from '../lib/supabaseClient';
import { invalidateMemoryCache } from './cloudService';

type RealtimeHandlers = {
  onPuzzleChange?: (payload: any) => void;
  onLeaderboardChange?: (payload: any) => void;
};

let channel: ReturnType<NonNullable<ReturnType<typeof getBrowserSupabase>>['channel']> | null = null;

export function startRealtime(handlers: RealtimeHandlers = {}) {
  const sb = getBrowserSupabase();
  if (!sb) {
    console.warn('[Realtime] Supabase client tidak tersedia');
    return () => {};
  }

  // Hindari double subscribe
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  channel = sb
    .channel('tts-public')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'puzzles' },
      (payload) => {
        // Invalidate cache list community / detail
        invalidateMemoryCache('community-puzzles', 'puzzle-');
        handlers.onPuzzleChange?.(payload);
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'leaderboard' },
      (payload) => {
        invalidateMemoryCache('leaderboard-');
        handlers.onLeaderboardChange?.(payload);
      }
    )
    .subscribe((status) => {
      console.log('[Realtime] status:', status);
    });

  return () => {
    if (channel && sb) {
      sb.removeChannel(channel);
      channel = null;
    }
  };
}