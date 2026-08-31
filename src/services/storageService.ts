import { CrosswordPuzzle, LeaderboardEntry, PuzzleProgress, UserProfile, PuzzleReactionType, PuzzleComment, PuzzleReactions } from '../types/tts';
import { SEEDED_COMMUNITY_PUZZLES } from './defaultPuzzles';
import { calculateScore } from './gridBuilder';

const MY_PUZZLES_KEY = 'tts_sharing_my_puzzles';
const DRAFTS_KEY = 'tts_sharing_drafts';
const SAVED_PUZZLES_KEY = 'tts_sharing_saved_puzzles';
const PROGRESS_MAP_KEY = 'tts_sharing_progress_map';
const LEADERBOARDS_KEY = 'tts_sharing_leaderboards';
const USER_PROFILE_KEY = 'tts_sharing_user_profile';
const ACTIVE_PUZZLE_ID_KEY = 'tts_sharing_active_puzzle_id';

const COMMUNITY_CACHE_KEY = 'tts_sharing_community_cache';
const USER_PUZZLE_REACTIONS_KEY = 'tts_sharing_user_puzzle_reactions';
const PUZZLE_COMMENTS_MAP_KEY = 'tts_sharing_puzzle_comments_map';
const PUZZLE_REACTIONS_MAP_KEY = 'tts_sharing_puzzle_reactions_map';
const THEME_KEY = 'tts_sharing_theme_mode';
const COLOR_ACCENT_KEY = 'tts_sharing_color_accent';


let autoSyncTimer: any = null;

// Asynchronous debounced background auto-sync trigger (coalesces rapid events into a single sync)
let cachedProfile: UserProfile | null = null;

export const StorageService = {
  // Clean up any legacy AI-seeded/demo data from previous sessions
  cleanLegacySeedData(): void {
    try {
      const savedData = localStorage.getItem(SAVED_PUZZLES_KEY);
      if (savedData) {
        const list: CrosswordPuzzle[] = JSON.parse(savedData);
        const filtered = list.filter((p) => !p.id.startsWith('tts_komunitas_'));
        localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(filtered));
      }

      const activeId = localStorage.getItem(ACTIVE_PUZZLE_ID_KEY);
      if (activeId && activeId.startsWith('tts_komunitas_')) {
        localStorage.removeItem(ACTIVE_PUZZLE_ID_KEY);
      }
    } catch (e) {
      // Ignore
    }
  },

  // Cache community puzzles returned from cloud database
  saveCommunityPuzzlesCache(puzzles: CrosswordPuzzle[]): void {
    try {
      localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(puzzles));
    } catch (e) {
      console.warn('Failed to cache community puzzles:', e);
    }
  },

  getCommunityPuzzlesCache(): CrosswordPuzzle[] {
    try {
      const data = localStorage.getItem(COMMUNITY_CACHE_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to read community puzzles cache:', e);
    }
    return [];
  },

  // Get actual accurate solved puzzles count from progress map
  getSolvedPuzzlesCount(): number {
    try {
      const data = localStorage.getItem(PROGRESS_MAP_KEY);
      if (data) {
        const progressMap = JSON.parse(data);
        return (Object.values(progressMap) as PuzzleProgress[]).filter((p) => p && p.isCompleted).length;
      }
    } catch {
      // Ignore
    }
    return 0;
  },

  // --- User Profile ---
  getUserProfile(): UserProfile {
    try {
      const data = localStorage.getItem(USER_PROFILE_KEY);
      if (data) {
        const parsed: UserProfile = JSON.parse(data);
        // Ensure totalSolved and totalCreated are always accurate without circular function calls
        const solvedCount = this.getSolvedPuzzlesCount();
        let myPuzzlesCount = 0;
        try {
          const myData = localStorage.getItem(MY_PUZZLES_KEY);
          if (myData) {
            const list = JSON.parse(myData);
            if (Array.isArray(list)) {
              myPuzzlesCount = list.filter((p: any) => p && !p.isDraft).length;
            }
          }
        } catch {
          // Ignore
        }
        parsed.totalSolved = Math.max(parsed.totalSolved || 0, solvedCount);
        parsed.totalCreated = Math.max(parsed.totalCreated || 0, myPuzzlesCount);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse user profile:', e);
    }
    // Default initial profile (only created when no profile exists at all)
    const defaultProfile: UserProfile = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: 'Pemain ' + Math.floor(1000 + Math.random() * 9000),
      avatar: '🦊',
      syncKey: 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: Date.now(),
      totalSolved: 0,
      totalCreated: 0,
    };
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(defaultProfile));
    } catch (e) {
      // Ignore
    }
    return defaultProfile;
  },

  saveUserProfile(profile: UserProfile): void {
    try {
      localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
      // Asynchronously sync profile with cloud backend if available
      if (typeof fetch !== 'undefined') {
        fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to save profile:', e);
    }
  },

  // --- Helper to hydrate a puzzle with persisted comments and reactions ---
  hydratePuzzleWithInteractions(puzzle: CrosswordPuzzle): CrosswordPuzzle {
    if (!puzzle) return puzzle;
    const localComments = this.getPuzzleComments(puzzle.id);
    const localReactions = this.getPuzzleReactions(puzzle.id);
    return {
      ...puzzle,
      comments: (Array.isArray(puzzle.comments) && puzzle.comments.length > 0)
        ? puzzle.comments
        : (localComments.length > 0 ? localComments : []),
      reactions: puzzle.reactions || localReactions || {
        like: 0,
        laugh: 0,
        love: 0,
        think: 0,
        fire: 0,
        sad: 0,
      },
    };
  },

  // --- Draft Puzzles (Work in Progress) ---
  getDraftPuzzles(): CrosswordPuzzle[] {
    try {
      const data = localStorage.getItem(DRAFTS_KEY);
      if (data) {
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          return list
            .filter((p) => p && p.isDraft)
            .map((p) => ({ ...p, isDraft: true }));
        }
      }
    } catch (e) {
      console.warn('Failed to load draft puzzles:', e);
    }
    return [];
  },

  saveDraftPuzzle(puzzle: CrosswordPuzzle): void {
    let profile: UserProfile | null = null;
    try {
      const pData = localStorage.getItem(USER_PROFILE_KEY);
      if (pData) profile = JSON.parse(pData);
    } catch {}

    let rawList: CrosswordPuzzle[] = [];
    try {
      const data = localStorage.getItem(DRAFTS_KEY);
      if (data) rawList = JSON.parse(data);
    } catch (e) {}

    const draft: CrosswordPuzzle = {
      ...puzzle,
      authorId: puzzle.authorId || profile?.id || 'usr_creator',
      authorEmail: puzzle.authorEmail || profile?.email,
      isDraft: true,
      updatedAt: Date.now(),
    };
    const idx = rawList.findIndex((p) => p.id === puzzle.id);
    if (idx >= 0) {
      rawList[idx] = draft;
    } else {
      rawList.unshift(draft);
    }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(rawList));
    this.triggerBackgroundAutoSync();
  },

  deleteDraftPuzzle(puzzleId: string): void {
    let rawList: CrosswordPuzzle[] = [];
    try {
      const data = localStorage.getItem(DRAFTS_KEY);
      if (data) rawList = JSON.parse(data);
    } catch (e) {}
    const filtered = rawList.filter((p) => p.id !== puzzleId);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
    this.triggerBackgroundAutoSync();
  },

  // --- My Published Created Puzzles ---
  getMyPuzzles(): CrosswordPuzzle[] {
    const map = new Map<string, CrosswordPuzzle>();
    let profile: UserProfile | null = null;
    try {
      const pData = localStorage.getItem(USER_PROFILE_KEY);
      if (pData) profile = JSON.parse(pData);
    } catch {}

    try {
      const data = localStorage.getItem(MY_PUZZLES_KEY);
      if (data) {
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          list.filter((p) => p && !p.isDraft).forEach((p) => {
            map.set(p.id, this.hydratePuzzleWithInteractions(p));
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load my puzzles:', e);
    }

    // Also look in community cache if author matches
    if (profile && (profile.id || profile.email)) {
      try {
        this.getCommunityPuzzlesCache().forEach((p) => {
          if (
            p &&
            !p.isDraft &&
            ((profile!.id && p.authorId === profile!.id) ||
              (profile!.email && p.authorEmail === profile!.email))
          ) {
            if (!map.has(p.id)) {
              map.set(p.id, this.hydratePuzzleWithInteractions(p));
            }
          }
        });
      } catch {}
    }

    return Array.from(map.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  },

  saveMyPuzzle(puzzle: CrosswordPuzzle): void {
    // When published, remove from drafts if it existed there
    this.deleteDraftPuzzle(puzzle.id);

    let profile: UserProfile | null = null;
    try {
      const pData = localStorage.getItem(USER_PROFILE_KEY);
      if (pData) profile = JSON.parse(pData);
    } catch {}

    let rawList: CrosswordPuzzle[] = [];
    try {
      const data = localStorage.getItem(MY_PUZZLES_KEY);
      if (data) rawList = JSON.parse(data);
    } catch (e) {}

    const publishedPuzzle: CrosswordPuzzle = {
      ...puzzle,
      authorId: puzzle.authorId || profile?.id || 'usr_creator',
      authorEmail: puzzle.authorEmail || profile?.email,
      isDraft: false,
      updatedAt: Date.now(),
    };

    const idx = rawList.findIndex((p) => p.id === puzzle.id);
    if (idx >= 0) {
      rawList[idx] = publishedPuzzle;
    } else {
      rawList.unshift({ ...publishedPuzzle, createdAt: puzzle.createdAt || Date.now() });
      if (profile) {
        profile.totalCreated = (profile.totalCreated || 0) + 1;
        try {
          localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
        } catch {}
      }
    }
    localStorage.setItem(MY_PUZZLES_KEY, JSON.stringify(rawList));

    // Also save/update in community cache so it appears immediately everywhere
    const community = this.getCommunityPuzzlesCache();
    const cIdx = community.findIndex((p) => p.id === puzzle.id);
    if (cIdx >= 0) {
      community[cIdx] = publishedPuzzle;
    } else {
      community.unshift(publishedPuzzle);
    }
    this.saveCommunityPuzzlesCache(community);

    this.triggerBackgroundAutoSync();
  },

  deleteMyPuzzle(puzzleId: string): void {
    let rawList: CrosswordPuzzle[] = [];
    try {
      const data = localStorage.getItem(MY_PUZZLES_KEY);
      if (data) rawList = JSON.parse(data);
    } catch (e) {}
    const filtered = rawList.filter((p) => p.id !== puzzleId);
    localStorage.setItem(MY_PUZZLES_KEY, JSON.stringify(filtered));

    // Also remove from community cache
    const community = this.getCommunityPuzzlesCache().filter((p) => p.id !== puzzleId);
    this.saveCommunityPuzzlesCache(community);

    this.deleteProgress(puzzleId);
    this.deleteLeaderboard(puzzleId);
    if (this.getActivePuzzleId() === puzzleId) {
      this.setActivePuzzleId(null);
    }
  },

  // --- Community / All Published Puzzles by Everyone ---
  getCommunityPuzzles(): CrosswordPuzzle[] {
    const map = new Map<string, CrosswordPuzzle>();

    // 1. Cloud cached puzzles
    this.getCommunityPuzzlesCache().forEach((p) => {
      if (p && !p.isDraft) map.set(p.id, this.hydratePuzzleWithInteractions(p));
    });

    // 2. Saved puzzles from other creators
    this.getSavedPuzzles().forEach((p) => {
      if (p && !p.isDraft) map.set(p.id, this.hydratePuzzleWithInteractions(p));
    });

    // 3. User's own published puzzles
    this.getMyPuzzles().forEach((p) => {
      if (p && !p.isDraft) map.set(p.id, this.hydratePuzzleWithInteractions(p));
    });

    return Array.from(map.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  },

  // --- Saved/Received Puzzles (From Codes / Links) ---
  getSavedPuzzles(): CrosswordPuzzle[] {
    try {
      const data = localStorage.getItem(SAVED_PUZZLES_KEY);
      if (data) {
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          return list.map((p) => this.hydratePuzzleWithInteractions(p));
        }
      }
    } catch (e) {
      console.warn('Failed to load saved puzzles:', e);
    }
    return [];
  },

  saveReceivedPuzzle(puzzle: CrosswordPuzzle): void {
    const list = this.getSavedPuzzles();
    const idx = list.findIndex((p) => p.id === puzzle.id);
    if (idx >= 0) {
      list[idx] = puzzle;
    } else {
      list.unshift(puzzle);
    }
    localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(list));
  },

  deleteSavedPuzzle(puzzleId: string): void {
    const list = this.getSavedPuzzles().filter((p) => p.id !== puzzleId);
    localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(list));
    this.deleteProgress(puzzleId);
    this.deleteLeaderboard(puzzleId);
    if (this.getActivePuzzleId() === puzzleId) {
      this.setActivePuzzleId(null);
    }
  },

  deleteProgress(puzzleId: string): void {
    try {
      const data = localStorage.getItem(PROGRESS_MAP_KEY);
      if (data) {
        const map: Record<string, PuzzleProgress> = JSON.parse(data);
        delete map[puzzleId];
        localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(map));
      }
    } catch (e) {
      console.warn('Failed to delete progress:', e);
    }
  },

  deleteLeaderboard(puzzleId: string): void {
    try {
      const data = localStorage.getItem(LEADERBOARDS_KEY);
      if (data) {
        const map: Record<string, LeaderboardEntry[]> = JSON.parse(data);
        delete map[puzzleId];
        localStorage.setItem(LEADERBOARDS_KEY, JSON.stringify(map));
      }
    } catch (e) {
      console.warn('Failed to delete leaderboard:', e);
    }
  },

  // Find a puzzle across all sources (My, Drafts, Saved, Community Cache)
  getPuzzleById(id: string): CrosswordPuzzle | null {
    const all = [
      ...this.getMyPuzzles(),
      ...this.getDraftPuzzles(),
      ...this.getSavedPuzzles(),
      ...this.getCommunityPuzzlesCache(),
    ];
    return all.find((p) => p.id === id) || null;
  },

  // Find puzzle by custom code or ID
  getPuzzleByCustomCode(code: string): CrosswordPuzzle | null {
    const clean = code.trim().toUpperCase();
    const all = [
      ...this.getMyPuzzles(),
      ...this.getSavedPuzzles(),
      ...this.getCommunityPuzzlesCache(),
    ];
    return (
      all.find(
        (p) =>
          (p.customCode && p.customCode.toUpperCase() === clean) ||
          p.id.toUpperCase() === clean
      ) || null
    );
  },

  // --- Puzzle Progress (Resume playing) ---
  getProgress(puzzleId: string): PuzzleProgress | null {
    try {
      const data = localStorage.getItem(PROGRESS_MAP_KEY);
      if (data) {
        const map: Record<string, PuzzleProgress> = JSON.parse(data);
        return map[puzzleId] || null;
      }
    } catch (e) {
      console.warn('Failed to load progress:', e);
    }
    return null;
  },

  saveProgress(progress: PuzzleProgress): void {
    try {
      const data = localStorage.getItem(PROGRESS_MAP_KEY);
      const map: Record<string, PuzzleProgress> = data ? JSON.parse(data) : {};
      map[progress.puzzleId] = progress;
      localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(map));

      // Trigger background cloud sync for logged in account
      this.triggerBackgroundAutoSync();
    } catch (e) {
      console.error('Failed to save progress:', e);
    }
  },

  getAllProgress(): Record<string, PuzzleProgress> {
    try {
      const data = localStorage.getItem(PROGRESS_MAP_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  // --- Leaderboards with Score Calculation ---
  getLeaderboard(puzzleId: string): LeaderboardEntry[] {
    try {
      const data = localStorage.getItem(LEADERBOARDS_KEY);
      const map: Record<string, LeaderboardEntry[]> = data ? JSON.parse(data) : {};
      
      const list = map[puzzleId] || [];

      // Ensure all entries have calculated score
      return list
        .map((entry) => ({
          ...entry,
          score: entry.score || calculateScore(entry.timeMs, 25),
        }))
        .sort((a, b) => a.timeMs - b.timeMs || (b.score || 0) - (a.score || 0));
    } catch (e) {
      console.warn('Failed to load leaderboard:', e);
    }
    return [];
  },

  getAllLeaderboards(): Record<string, LeaderboardEntry[]> {
    try {
      const data = localStorage.getItem(LEADERBOARDS_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  },

  addLeaderboardEntry(entry: LeaderboardEntry): void {
    try {
      const data = localStorage.getItem(LEADERBOARDS_KEY);
      const map: Record<string, LeaderboardEntry[]> = data ? JSON.parse(data) : {};
      const list = map[entry.puzzleId] || [];

      const entryWithScore: LeaderboardEntry = {
        ...entry,
        score: entry.score || calculateScore(entry.timeMs, 25),
      };

      const playerKey = (e: LeaderboardEntry) =>
        (e.playerId && `id:${e.playerId}`) ||
        ((e as any).playerEmail && `email:${String((e as any).playerEmail).toLowerCase()}`) ||
        `name:${(e.playerName || '').toLowerCase()}`;

      const key = playerKey(entryWithScore);
      const idx = list.findIndex((x) => playerKey(x) === key);
      let isNewRecord = false;
      if (idx >= 0) {
        const prev = list[idx];
        if (
          entryWithScore.timeMs < prev.timeMs ||
          (entryWithScore.timeMs === prev.timeMs && (entryWithScore.score || 0) > (prev.score || 0))
        ) {
          list[idx] = { ...prev, ...entryWithScore, id: prev.id };
          isNewRecord = true;
        }
      } else {
        list.push(entryWithScore);
        isNewRecord = true;
      }

      list.sort((a, b) => {
        const ta = a.timeMs > 0 ? a.timeMs : Number.MAX_SAFE_INTEGER;
        const tb = b.timeMs > 0 ? b.timeMs : Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return (b.score || 0) - (a.score || 0);
      });

      map[entry.puzzleId] = list.slice(0, 50);
      localStorage.setItem(LEADERBOARDS_KEY, JSON.stringify(map));

      // totalSolved hanya naik jika skor baru (bukan duplikat submit)
      if (isNewRecord && idx < 0) {
        const profile = this.getUserProfile();
        profile.totalSolved = (profile.totalSolved || 0) + 1;
        this.saveUserProfile(profile);
      }
    } catch (e) {
      console.error('Failed to add leaderboard entry:', e);
    }
  },

  // --- Active Session ---
  getActivePuzzleId(): string | null {
    return localStorage.getItem(ACTIVE_PUZZLE_ID_KEY);
  },

  setActivePuzzleId(id: string | null): void {
    if (id) {
      localStorage.setItem(ACTIVE_PUZZLE_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PUZZLE_ID_KEY);
    }
  },

  // --- Puzzle Emoticon Reactions & Interaction Storage ---
  getUserPuzzleReactions(): Record<string, PuzzleReactionType> {
    try {
      const data = localStorage.getItem(USER_PUZZLE_REACTIONS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      // Ignore
    }
    return {};
  },

  getUserPuzzleReaction(puzzleId: string): PuzzleReactionType | null {
    const all = this.getUserPuzzleReactions();
    return all[puzzleId] || null;
  },

  setUserPuzzleReaction(puzzleId: string, reaction: PuzzleReactionType | null): void {
    try {
      const all = this.getUserPuzzleReactions();
      if (reaction) {
        all[puzzleId] = reaction;
      } else {
        delete all[puzzleId];
      }
      localStorage.setItem(USER_PUZZLE_REACTIONS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to save user puzzle reaction:', e);
    }
  },

  // Get all persisted puzzle reactions map
  getAllPuzzleReactions(): Record<string, PuzzleReactions> {
    try {
      const data = localStorage.getItem(PUZZLE_REACTIONS_MAP_KEY);
      if (data) return JSON.parse(data);
    } catch {}
    return {};
  },

  getPuzzleReactions(puzzleId: string): PuzzleReactions | null {
    const all = this.getAllPuzzleReactions();
    return all[puzzleId] || null;
  },

  updatePuzzleReactions(puzzleId: string, reactions: PuzzleReactions): void {
    try {
      const all = this.getAllPuzzleReactions();
      all[puzzleId] = reactions;
      localStorage.setItem(PUZZLE_REACTIONS_MAP_KEY, JSON.stringify(all));

      // Also update in community cache
      const community = this.getCommunityPuzzlesCache();
      const idx = community.findIndex((p) => p.id === puzzleId);
      if (idx >= 0) {
        community[idx].reactions = reactions;
        this.saveCommunityPuzzlesCache(community);
      }

      // Also update in my puzzles
      const myPuzzles = this.getMyPuzzles();
      const myIdx = myPuzzles.findIndex((p) => p.id === puzzleId);
      if (myIdx >= 0) {
        myPuzzles[myIdx].reactions = reactions;
        localStorage.setItem(MY_PUZZLES_KEY, JSON.stringify(myPuzzles));
      }
    } catch (e) {
      console.warn('Failed to save puzzle reactions:', e);
    }
  },

  // Updates local cache of a puzzle's reactions (backward-compatible alias)
  updateCachedPuzzleReactions(puzzleId: string, reactions: PuzzleReactions): void {
    this.updatePuzzleReactions(puzzleId, reactions);
  },

  // --- Comments Storage ---
  getAllPuzzleComments(): Record<string, PuzzleComment[]> {
    try {
      const data = localStorage.getItem(PUZZLE_COMMENTS_MAP_KEY);
      if (data) return JSON.parse(data);
    } catch {}
    return {};
  },

  getPuzzleComments(puzzleId: string): PuzzleComment[] {
    const all = this.getAllPuzzleComments();
    return all[puzzleId] || [];
  },

  addPuzzleComment(puzzleId: string, comment: PuzzleComment): void {
    try {
      const all = this.getAllPuzzleComments();
      const list = all[puzzleId] || [];
      const exists = list.some((c) => c.id === comment.id);
      if (!exists) {
        list.push(comment);
      }
      all[puzzleId] = list;
      localStorage.setItem(PUZZLE_COMMENTS_MAP_KEY, JSON.stringify(all));

      // Update in community cache
      const community = this.getCommunityPuzzlesCache();
      const idx = community.findIndex((p) => p.id === puzzleId);
      if (idx >= 0) {
        community[idx].comments = list;
        this.saveCommunityPuzzlesCache(community);
      }

      // Update in my puzzles
      const myPuzzles = this.getMyPuzzles();
      const myIdx = myPuzzles.findIndex((p) => p.id === puzzleId);
      if (myIdx >= 0) {
        myPuzzles[myIdx].comments = list;
        localStorage.setItem(MY_PUZZLES_KEY, JSON.stringify(myPuzzles));
      }
    } catch (e) {
      console.warn('Failed to save puzzle comment:', e);
    }
  },

  deletePuzzleComment(puzzleId: string, commentId: string): void {
    try {
      const all = this.getAllPuzzleComments();
      if (all[puzzleId]) {
        all[puzzleId] = all[puzzleId].filter((c) => c.id !== commentId);
        localStorage.setItem(PUZZLE_COMMENTS_MAP_KEY, JSON.stringify(all));

        // Update in community cache
        const community = this.getCommunityPuzzlesCache();
        const idx = community.findIndex((p) => p.id === puzzleId);
        if (idx >= 0) {
          community[idx].comments = all[puzzleId];
          this.saveCommunityPuzzlesCache(community);
        }
      }
    } catch (e) {
      console.warn('Failed to delete puzzle comment:', e);
    }
  },

  // Updates local cache of a puzzle's comments (backward-compatible alias)
  addCachedPuzzleComment(puzzleId: string, comment: PuzzleComment): void {
    this.addPuzzleComment(puzzleId, comment);
  },

  // --- Cloud Account Hydration & Background Auto-Sync ---
  clearPrivateAccountData(): void {
    try {
      localStorage.removeItem(MY_PUZZLES_KEY);
      localStorage.removeItem(DRAFTS_KEY);
      localStorage.removeItem(PROGRESS_MAP_KEY);
      localStorage.removeItem(USER_PUZZLE_REACTIONS_KEY);
      localStorage.removeItem(ACTIVE_PUZZLE_ID_KEY);
    } catch (e) {
      // Ignore
    }
  },

  clearGuestSessionData(): void {
    try {
      localStorage.removeItem(MY_PUZZLES_KEY);
      localStorage.removeItem(DRAFTS_KEY);
      localStorage.removeItem(PROGRESS_MAP_KEY);
      localStorage.removeItem(USER_PUZZLE_REACTIONS_KEY);
      localStorage.removeItem(ACTIVE_PUZZLE_ID_KEY);
    } catch (e) {
      // Ignore
    }
  },

  hydrateCloudAccountData(cloudData: {
    profile?: UserProfile;
    puzzles?: CrosswordPuzzle[];
    drafts?: CrosswordPuzzle[];
    progress?: Record<string, PuzzleProgress>;
  }): void {
    try {
      if (cloudData.profile) {
        this.saveUserProfile(cloudData.profile);
      }
      // PENTING: GABUNGKAN dengan data lokal, JANGAN timpa total.
      // Sebelumnya localStorage.setItem(...) langsung menimpa seluruh
      // MY_PUZZLES_KEY / DRAFTS_KEY dengan data cloud — kalau user membuat
      // TTS sebagai tamu (belum login) lalu baru daftar/login, akun baru
      // di cloud pasti kosong, sehingga TTS yang baru dibuat lokal itu
      // langsung LENYAP tertimpa array kosong dari cloud. Sekarang: entri
      // yang juga ada di cloud memakai versi cloud (otoritatif), tapi
      // entri yang HANYA ada secara lokal (belum sempat ke-sync) tetap
      // dipertahankan.
      if (Array.isArray(cloudData.puzzles)) {
        let localPuzzles: CrosswordPuzzle[] = [];
        try {
          const raw = localStorage.getItem(MY_PUZZLES_KEY);
          if (raw) localPuzzles = JSON.parse(raw);
        } catch {}
        const merged = new Map<string, CrosswordPuzzle>();
        localPuzzles.forEach((p) => p && p.id && merged.set(p.id, p));
        cloudData.puzzles.forEach((p) => p && p.id && merged.set(p.id, p));
        localStorage.setItem(MY_PUZZLES_KEY, JSON.stringify(Array.from(merged.values())));
      }
      if (Array.isArray(cloudData.drafts)) {
        let localDrafts: CrosswordPuzzle[] = [];
        try {
          const raw = localStorage.getItem(DRAFTS_KEY);
          if (raw) localDrafts = JSON.parse(raw);
        } catch {}
        const merged = new Map<string, CrosswordPuzzle>();
        localDrafts.forEach((p) => p && p.id && merged.set(p.id, p));
        cloudData.drafts.forEach((p) => p && p.id && merged.set(p.id, p));
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(Array.from(merged.values())));
      }
      if (cloudData.progress) {
        const localProg = this.getAllProgress();
        const mergedProg = { ...localProg, ...cloudData.progress };
        localStorage.setItem(PROGRESS_MAP_KEY, JSON.stringify(mergedProg));
      }
      // Kirim entri lokal yang tadi dipertahankan (belum ada di cloud) ke
      // server, supaya benar-benar tersimpan permanen di akun ini.
      this.triggerBackgroundAutoSync();
    } catch (e) {
      console.error('Failed to hydrate cloud data:', e);
    }
  },

  // Asynchronous debounced background auto-sync trigger (coalesces rapid events into a single sync)
  triggerBackgroundAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
    }
    autoSyncTimer = setTimeout(() => {
      try {
        const profile = this.getUserProfile();
        if (!profile.autoSyncEnabled && !profile.isLoggedIn) return;

        const myPuzzles = this.getMyPuzzles();
        const drafts = this.getDraftPuzzles();
        const progress = this.getAllProgress();

        fetch('/api/auth/auto-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(profile.authToken ? { Authorization: `Bearer ${profile.authToken}` } : {}),
          },
          body: JSON.stringify({
            profile,
            authToken: profile.authToken,
            puzzles: myPuzzles,
            drafts,
            progress,
          }),
        }).catch(() => {});
      } catch (e) {
        // Ignore background sync network issues
      }
    }, 1200);
  },

  // --- Dark Mode / Theme Preferences ---
  getTheme(): 'light' | 'dark' {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (e) {
      // Ignore
    }
    return 'light';
  },

  setTheme(theme: 'light' | 'dark'): void {
    try {
      localStorage.setItem(THEME_KEY, theme);
      if (typeof document !== 'undefined') {
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (e) {
      // Ignore
    }
  },

  // --- Color accent theme (footer palette) ---
  getColorAccent(): string {
    try {
      const saved = localStorage.getItem(COLOR_ACCENT_KEY);
      const allowed = ['indigo', 'violet', 'fuchsia', 'ocean', 'sky', 'teal', 'emerald', 'lime', 'amber', 'sunset', 'rose', 'coral', 'midnight', 'slate'];
      if (saved && allowed.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return 'indigo';
  },

  setColorAccent(accent: string): void {
    const allowed = ['indigo', 'violet', 'fuchsia', 'ocean', 'sky', 'teal', 'emerald', 'lime', 'amber', 'sunset', 'rose', 'coral', 'midnight', 'slate'];
    const value = allowed.includes(accent) ? accent : 'indigo';
    try {
      localStorage.setItem(COLOR_ACCENT_KEY, value);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-accent', value);
      }
    } catch {
      // ignore
    }
  },

};
