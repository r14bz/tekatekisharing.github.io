import { CrosswordPuzzle, LeaderboardEntry, PuzzleReactionType, PuzzleComment, PuzzleReactions } from '../types/tts';
import { StorageService } from './storageService';

const API_BASE = '/api';

/* =========================================================
   In-memory cache with TTL (React Query-style lightweight cache)
   ========================================================= */
type CacheEntry<T> = { data: T; expires: number };

const memoryCache = new Map<string, CacheEntry<any>>();

const DEFAULT_TTL = 30_000;       // 30 detik � list community
const LEADERBOARD_TTL = 20_000;   // 20 detik
const COMMENTS_TTL = 15_000;      // 15 detik
const PUZZLE_DETAIL_TTL = 25_000; // 25 detik

function getCache<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryCache.delete(key);
    return null;
  }
  return item.data as T;
}

function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  memoryCache.set(key, { data, expires: Date.now() + ttl });
}

/** Invalidate one or more cache keys / prefixes */
function invalidateCache(...keysOrPrefixes: string[]): void {
  if (keysOrPrefixes.length === 0) {
    memoryCache.clear();
    return;
  }
  for (const key of keysOrPrefixes) {
    if (memoryCache.has(key)) {
      memoryCache.delete(key);
      continue;
    }
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(key)) memoryCache.delete(k);
    }
  }
}

/** Allow other modules (Admin, Sync) to force-refresh cache */
export function invalidateMemoryCache(...keys: string[]) {
  invalidateCache(...keys);
}

export const CloudService = {

  /**
   * Fetches all published puzzles from the cloud database.
   * Cloud (API/Supabase) is the source of truth when reachable —
   * local cache is only used as offline fallback so deleted TTS
   * do not reappear in the community tab.
   */
  async getCommunityPuzzles(): Promise<CrosswordPuzzle[]> {
    const cacheKey = 'community-puzzles';
    const cached = getCache<CrosswordPuzzle[]>(cacheKey);
    if (cached) return cached;

    // Offline / fallback seed (only used if cloud fetch fails)
    const buildLocalFallback = (): CrosswordPuzzle[] => {
      const map = new Map<string, CrosswordPuzzle>();
      StorageService.getCommunityPuzzlesCache().forEach((p) => {
        if (p && !p.isDraft) map.set(p.id, p);
      });
      StorageService.getMyPuzzles().forEach((p) => {
        if (p && !p.isDraft) map.set(p.id, p);
      });
      StorageService.getSavedPuzzles().forEach((p) => {
        if (p && !p.isDraft) map.set(p.id, p);
      });
      return Array.from(map.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
    };

    try {
      const res = await fetch(`${API_BASE}/puzzles`, {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            // Source of truth: ONLY what the cloud returns (non-draft)
            const cloudList: CrosswordPuzzle[] = json.data
              .filter((cp: CrosswordPuzzle) => cp && !cp.isDraft)
              .sort(
                (a: CrosswordPuzzle, b: CrosswordPuzzle) =>
                  (b.createdAt || 0) - (a.createdAt || 0)
              );

            // Overwrite community cache so deleted puzzles disappear
            StorageService.saveCommunityPuzzlesCache(cloudList);

            // Prune local "my puzzles" that no longer exist on cloud
            // (owner deleted elsewhere / admin deleted)
            try {
              const cloudIds = new Set(cloudList.map((p) => p.id));
              const myList = StorageService.getMyPuzzles();
              const stillMine = myList.filter((p) => cloudIds.has(p.id));
              // Re-save only those still on cloud (deleteMyPuzzle side-effects avoided for batch)
              if (stillMine.length !== myList.length) {
                const raw = stillMine;
                localStorage.setItem('tts_sharing_my_puzzles', JSON.stringify(raw));
              }
            } catch {
              // ignore storage errors
            }

            // NOTE: intentionally NO auto-reseed / batch-sync here.
            // Re-uploading "missing" local puzzles would revive deleted TTS.

            setCache(cacheKey, cloudList, DEFAULT_TTL);
            return cloudList;
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch from cloud database, using local cache:', err);
    }

    const fallback = buildLocalFallback();
    if (fallback.length > 0) {
      StorageService.saveCommunityPuzzlesCache(fallback);
    }
    setCache(cacheKey, fallback, DEFAULT_TTL);
    return fallback;
  },

  /**
   * Catat 1x play per puzzle per tab session.
   * Menghindari spam double-click; server menaikkan playsCount.
   */
  async recordPuzzlePlay(puzzleId: string): Promise<number | null> {
    if (!puzzleId) return null;
    try {
      const key = `tts_play_counted_${puzzleId}`;
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
        return null;
      }
      const profile = StorageService.getUserProfile();
      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          playerName: profile.name || 'Pemain TTS',
          playerAvatar: profile.avatar || '🦊',
          playerId: profile.id || null,
          playerEmail: profile.email || null,
        }),
      });
      if (!res.ok) {
        console.warn('[play] HTTP', res.status);
        return null;
      }
      const json = await res.json();
      if (json?.success) {
        try {
          sessionStorage.setItem(key, '1');
        } catch { /* ignore */ }
        // Update community cache locally so UI sees new counts without full reload lag
        try {
          const list = StorageService.getCommunityPuzzlesCache() || [];
          const next = list.map((p: any) =>
            p.id === puzzleId
              ? {
                  ...p,
                  playsCount: json.playsCount ?? (Number(p.playsCount) || 0) + 1,
                  lastPlayerName: json.lastPlayerName || profile.name,
                  lastPlayerAvatar: json.lastPlayerAvatar || profile.avatar,
                  lastPlayedAt: json.lastPlayedAt || Date.now(),
                }
              : p
          );
          StorageService.saveCommunityPuzzlesCache(next);
        } catch { /* ignore */ }
        try {
          // @ts-ignore
          if (typeof memoryCache !== 'undefined' && memoryCache?.clear) memoryCache.clear();
        } catch { /* ignore */ }
        // Notify UI to refetch
        try {
          window.dispatchEvent(
            new CustomEvent('tts-play-recorded', {
              detail: {
                puzzleId,
                playsCount: json.playsCount,
                lastPlayerName: json.lastPlayerName,
                lastPlayerAvatar: json.lastPlayerAvatar,
              },
            })
          );
        } catch { /* ignore */ }
        return typeof json.playsCount === 'number' ? json.playsCount : null;
      }
    } catch (err) {
      console.warn('[play] error', err);
    }
    return null;
  },


  /**
   * Publishes a crossword puzzle to the shared cloud database
   */
  async publishPuzzle(puzzle: CrosswordPuzzle): Promise<{ success: boolean; data?: CrosswordPuzzle; message?: string }> {
    try {
      const profile = StorageService.getUserProfile();
      const res = await fetch(`${API_BASE}/puzzles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-author-id': profile.id || '',
          'x-sync-key': profile.syncKey || '',
          ...(profile.authToken ? { 'Authorization': `Bearer ${profile.authToken}` } : {}),
        },
        body: JSON.stringify({
          ...puzzle,
          authorId: puzzle.authorId || profile.id,
          authorEmail: puzzle.authorEmail || profile.email,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        invalidateCache('community-puzzles', `puzzle:${json.data.id}`);
        StorageService.saveMyPuzzle(json.data);
        return { success: true, data: json.data, message: json.message };
      }
      return { success: false, message: json.message || 'Gagal menyimpan ke cloud.' };
    } catch (err: any) {
      console.error('Error publishing to cloud database:', err);
      StorageService.saveMyPuzzle(puzzle);
      return { success: true, data: puzzle, message: 'Tersimpan di lokal (sedang offline).' };
    }
  },

  /**
   * Searches a puzzle by its custom code or unique ID from cloud database
   */
  async findPuzzleByCodeOrId(codeOrId: string): Promise<CrosswordPuzzle | null> {
    const cacheKey = `puzzle:${codeOrId}`;
    const cached = getCache<CrosswordPuzzle>(cacheKey);
    if (cached) return cached;

    try {
      const clean = codeOrId.trim();
      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          StorageService.saveReceivedPuzzle(json.data);
          setCache(cacheKey, json.data, PUZZLE_DETAIL_TTL);
          if (json.data.id) setCache(`puzzle:${json.data.id}`, json.data, PUZZLE_DETAIL_TTL);
          return json.data;
        }
      }
    } catch (err) {
      console.warn('Cloud search error:', err);
    }
    return StorageService.getPuzzleByCustomCode(codeOrId) || StorageService.getPuzzleById(codeOrId);
  },

  /**
   * Deletes a puzzle from cloud database and clears local community traces
   */
  async deletePuzzle(id: string): Promise<{ success: boolean; message?: string }> {
    invalidateCache('community-puzzles', `puzzle:${id}`, `comments:${id}`, `leaderboard:${id}`);
    // Optimistic local cleanup so community tab updates immediately
    try {
      StorageService.deleteMyPuzzle(id);
      StorageService.deleteSavedPuzzle(id);
      const community = StorageService.getCommunityPuzzlesCache().filter((p) => p.id !== id);
      StorageService.saveCommunityPuzzlesCache(community);
    } catch {
      // ignore
    }
    try {
      const profile = StorageService.getUserProfile();
      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'x-author-id': profile.id || '',
          'x-sync-key': profile.syncKey || '',
          ...(profile.authToken ? { 'Authorization': `Bearer ${profile.authToken}` } : {}),
        },
      });
      const json = await res.json();
      return { success: json.success, message: json.message };
    } catch (err) {
      console.error('Error deleting puzzle from cloud:', err);
      return { success: false, message: 'Gagal menghubungi server cloud.' };
    }
  },

  /**
   * Fetches leaderboard entries for a puzzle from cloud database
   */
  async getLeaderboard(puzzleId: string): Promise<LeaderboardEntry[]> {
    const cacheKey = `leaderboard:${puzzleId}`;
    const cached = getCache<LeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${API_BASE}/leaderboard/${encodeURIComponent(puzzleId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          // Cloud is source of truth (empty array is valid)
          setCache(cacheKey, json.data, LEADERBOARD_TTL);
          return json.data;
        }
      }
    } catch (err) {
      console.warn('Error fetching cloud leaderboard:', err);
    }
    return StorageService.getLeaderboard(puzzleId);
  },

  /**
   * Fetches all global leaderboard entries from cloud database
   */
  async getGlobalLeaderboards(): Promise<LeaderboardEntry[]> {
    const cacheKey = 'global-leaderboards';
    const cached = getCache<LeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${API_BASE}/leaderboards`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCache(cacheKey, json.data, LEADERBOARD_TTL);
          return json.data;
        }
      }
    } catch (err) {
      console.warn('Error fetching global leaderboards:', err);
    }
    const allMaps = StorageService.getAllLeaderboards();
    const combined: LeaderboardEntry[] = [];
    Object.values(allMaps).forEach((list) => {
      combined.push(...list);
    });
    return combined;
  },

  /**
   * Performs full 2-way cloud database sync
   */
  async syncFullDatabase(
    profile: any,
    puzzles: CrosswordPuzzle[],
    leaderboards: Record<string, LeaderboardEntry[]>
  ): Promise<{ success: boolean; message: string }> {
    invalidateCache(); // full clear
    try {
      const res = await fetch(`${API_BASE}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, puzzles, leaderboards }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          return { success: true, message: json.message || 'Sinkronisasi cloud database berhasil!' };
        }
      }
    } catch (err) {
      console.warn('Error during full cloud sync:', err);
    }
    return { success: true, message: 'Data tersimpan di penyimpanan lokal.' };
  },

  /**
   * Submits a score / completion to the shared cloud leaderboard
   */
  async submitScore(puzzleId: string, entry: any): Promise<LeaderboardEntry> {
    invalidateCache(`leaderboard:${puzzleId}`, 'global-leaderboards');
    const fullEntry: LeaderboardEntry = {
      ...entry,
      id: entry.id || 'lead_' + Math.random().toString(36).substring(2, 9),
      puzzleId,
      completedAt: entry.completedAt || Date.now(),
    };
    StorageService.addLeaderboardEntry(fullEntry);

    try {
      const res = await fetch(`${API_BASE}/leaderboard/${encodeURIComponent(puzzleId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullEntry),
      });
      const json = await res.json();
      if (json.success && json.data) {
        StorageService.addLeaderboardEntry(json.data);
        if (Array.isArray(json.list)) {
          setCache(`leaderboard:${puzzleId}`, json.list, LEADERBOARD_TTL);
        }
        if (json.persisted === false) {
          console.warn('Leaderboard not persisted to Supabase:', json.persistError || json.message);
        }
        return json.data;
      }
    } catch (err) {
      console.warn('Error submitting score to cloud leaderboard:', err);
    }

    return fullEntry;
  },

  /**
   * --- TEKA TEKI SILANG COMMENTS & EMOTICON REACTIONS ---
   */

  /**
   * Reacts to a crossword puzzle with emoticon (like, laugh, love, think, fire, sad)
   */
  async reactToPuzzle(
    puzzleId: string,
    reactionType: PuzzleReactionType | null,
    previousReaction?: PuzzleReactionType | null,
    profile?: any
  ): Promise<PuzzleReactions | null> {
    invalidateCache('community-puzzles', `puzzle:${puzzleId}`);
    StorageService.setUserPuzzleReaction(puzzleId, reactionType);

    const current = StorageService.getPuzzleReactions(puzzleId) || {
      like: 0,
      laugh: 0,
      love: 0,
      think: 0,
      fire: 0,
      sad: 0,
    };
    const nextReactions: PuzzleReactions = { ...current };
    if (previousReaction && nextReactions[previousReaction] !== undefined && nextReactions[previousReaction] > 0) {
      nextReactions[previousReaction] = Math.max(0, nextReactions[previousReaction] - 1);
    }
    if (reactionType && nextReactions[reactionType] !== undefined) {
      nextReactions[reactionType] = (nextReactions[reactionType] || 0) + 1;
    }
    StorageService.updatePuzzleReactions(puzzleId, nextReactions);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (profile?.authToken) {
        headers['Authorization'] = `Bearer ${profile.authToken}`;
      }
      if (profile?.id) {
        headers['x-author-id'] = profile.id;
      }

      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/react`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reactionType,
          previousReaction,
          userId: profile?.id || '',
          userEmail: profile?.email || '',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.reactions) {
          StorageService.updatePuzzleReactions(puzzleId, json.reactions);
          return json.reactions;
        }
      }
    } catch (err) {
      console.warn('Error reacting to crossword puzzle in cloud:', err);
    }
    return nextReactions;
  },

  /**
   * Fetches comments for a crossword puzzle
   */
  async getPuzzleComments(puzzleId: string): Promise<PuzzleComment[]> {
    const cacheKey = `comments:${puzzleId}`;
    const cached = getCache<PuzzleComment[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/comments`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          json.data.forEach((c: PuzzleComment) => StorageService.addPuzzleComment(puzzleId, c));
          setCache(cacheKey, json.data, COMMENTS_TTL);
          return json.data;
        }
      }
    } catch (err) {
      console.warn('Error fetching comments for puzzle:', err);
    }

    return StorageService.getPuzzleComments(puzzleId);
  },

  /**
   * Adds a new comment to a crossword puzzle
   */
  async addPuzzleComment(
    puzzleId: string,
    comment: { authorName?: string; authorAvatar?: string; authorId?: string; authorEmail?: string; content: string },
    profile?: any
  ): Promise<PuzzleComment | null> {
    invalidateCache(`comments:${puzzleId}`, 'community-puzzles', `puzzle:${puzzleId}`);
    const localComment: PuzzleComment = {
      id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      puzzleId,
      authorName: (comment.authorName || 'Pemain TTS').trim(),
      authorAvatar: comment.authorAvatar || '',
      authorId: comment.authorId,
      content: comment.content.trim(),
      createdAt: Date.now(),
    };

    StorageService.addPuzzleComment(puzzleId, localComment);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (profile?.authToken) {
        headers['Authorization'] = `Bearer ${profile.authToken}`;
      }
      if (profile?.id || comment.authorId) {
        headers['x-author-id'] = profile?.id || comment.authorId || '';
      }

      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...comment,
          authorEmail: profile?.email || comment.authorEmail || '',
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          StorageService.addPuzzleComment(puzzleId, json.data);
          return json.data;
        }
      }
    } catch (err) {
      console.error('Error adding comment to puzzle:', err);
    }

    return localComment;
  },

  /**
   * Deletes a comment from a crossword puzzle
   */
  async deletePuzzleComment(puzzleId: string, commentId: string): Promise<boolean> {
    invalidateCache(`comments:${puzzleId}`, 'community-puzzles', `puzzle:${puzzleId}`);
    StorageService.deletePuzzleComment(puzzleId, commentId);
    try {
      const profile = StorageService.getUserProfile();
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'x-author-id': profile.id || '',
        'x-sync-key': profile.syncKey || '',
      };
      if (profile.authToken) {
        headers['Authorization'] = `Bearer ${profile.authToken}`;
      }
      const res = await fetch(`${API_BASE}/puzzles/${encodeURIComponent(puzzleId)}/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        return !!json.success;
      }
      return false;
    } catch (err) {
      console.error('Error deleting puzzle comment:', err);
    }
    return false;
  },
};