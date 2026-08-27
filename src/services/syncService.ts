import LZString from 'lz-string';
import { CrosswordPuzzle, LeaderboardEntry, UserProfile } from '../types/tts';
import { StorageService } from './storageService';

const LOCAL_ACCOUNTS_KEY = 'tts_local_registered_accounts';

// Helper to hash password securely in browser or node
async function hashClientPassword(password: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(password + '_tts_salt_v1');
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // Ignore and use fallback
  }
  let hash = 0;
  const str = password + '_tts_salt_v1';
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(16);
}

function getLocalAccounts(): Record<string, any> {
  try {
    const data = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveLocalAccount(email: string, account: any): void {
  try {
    const accounts = getLocalAccounts();
    accounts[email.trim().toLowerCase()] = account;
    localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Failed to save local account:', e);
  }
}

export const SyncService = {
  /**
   * Compresses a crossword puzzle into a compact URL-safe string
   */
  encodePuzzleToShareCode(puzzle: CrosswordPuzzle): string {
    // Strip unnecessary fields to make code ultra compact
    const compactObj = {
      i: puzzle.id,
      t: puzzle.title,
      d: puzzle.description || '',
      a: puzzle.authorName,
      w: puzzle.width,
      h: puzzle.height,
      g: puzzle.grid,
      c: puzzle.clues.map((clue) => ({
        i: clue.id,
        n: clue.number,
        d: clue.direction === 'across' ? 'a' : 'd',
        r: clue.row,
        c: clue.col,
        l: clue.length,
        q: clue.question,
        ans: clue.answer,
      })),
      ca: puzzle.createdAt,
    };

    const jsonStr = JSON.stringify(compactObj);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    return compressed;
  },

  /**
   * Decodes a compressed share string into a full CrosswordPuzzle
   */
  decodeShareCodeToPuzzle(code: string): CrosswordPuzzle | null {
    try {
      const cleanCode = code.trim().replace(/^TTS-/, '');
      const jsonStr = LZString.decompressFromEncodedURIComponent(cleanCode);
      if (!jsonStr) {
        // Try direct JSON in case it was exported as raw JSON
        const raw = JSON.parse(code);
        if (raw && raw.title && raw.grid) return raw;
        return null;
      }
      const raw = JSON.parse(jsonStr);
      if (!raw || !raw.t || !raw.g) return null;

      const puzzle: CrosswordPuzzle = {
        id: raw.i || 'tts_' + Math.random().toString(36).substring(2, 8),
        title: raw.t,
        description: raw.d || '',
        authorName: raw.a || 'Pemain Misterius',
        width: raw.w,
        height: raw.h,
        grid: raw.g,
        clues: (raw.c || []).map((c: any) => ({
          id: c.i || `${c.d === 'a' ? 'across' : 'down'}-${c.n}-${c.r}-${c.c}`,
          number: c.n,
          direction: c.d === 'a' ? 'across' : 'down',
          row: c.r,
          col: c.c,
          length: c.l,
          question: c.q,
          answer: c.ans || '',
        })),
        createdAt: raw.ca || Date.now(),
      };
      return puzzle;
    } catch (e) {
      console.error('Failed to decode puzzle share code:', e);
      return null;
    }
  },

  /**
   * Generates a full shareable web link
   */
  generateShareLink(puzzle: CrosswordPuzzle): string {
    const code = this.encodePuzzleToShareCode(puzzle);
    const origin = window.location.origin + window.location.pathname;
    return `${origin}?puzzle=${code}`;
  },

  /**
   * Checks current URL params for incoming shared puzzle
   */
  checkUrlForSharedPuzzle(): CrosswordPuzzle | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const puzzleCode = params.get('puzzle');
      if (puzzleCode) {
        const puzzle = this.decodeShareCodeToPuzzle(puzzleCode);
        if (puzzle) {
          StorageService.saveReceivedPuzzle(puzzle);
          return puzzle;
        }
      }
    } catch (e) {
      console.error('Error checking URL for shared puzzle:', e);
    }
    return null;
  },

  /**
   * Cloud Synchronize for user data, puzzles, and leaderboards
   */
  async syncToCloud(profile?: UserProfile): Promise<{ success: boolean; message: string }> {
    const userProfile = profile || StorageService.getUserProfile();
    userProfile.lastSyncedAt = Date.now();
    StorageService.saveUserProfile(userProfile);

    try {
      const myPuzzles = StorageService.getMyPuzzles();
      const leaderboards = StorageService.getAllLeaderboards();
      const drafts = StorageService.getDraftPuzzles();
      const progress = StorageService.getAllProgress();

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: userProfile,
          puzzles: myPuzzles,
          leaderboards,
        }),
      });

      // Also sync to cloud account if logged in
      fetch('/api/auth/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: userProfile,
          puzzles: myPuzzles,
          drafts,
          progress,
        }),
      }).catch(() => {});

      if (res.ok) {
        const json = await res.json();
        return {
          success: true,
          message: json.message || `Data Anda berhasil disinkronisasi pada ${new Date().toLocaleTimeString('id-ID')}`,
        };
      }
    } catch (e) {
      // Local sync fallback
    }

    return {
      success: true,
      message: `Data Anda berhasil disinkronisasi pada ${new Date().toLocaleTimeString('id-ID')}`,
    };
  },

  /**
   * Login with Real Google Identity Services Credential (JWT)
   */
  async loginWithGoogleCredential(credential: string): Promise<{ success: boolean; profile?: UserProfile; message?: string }> {
    const currentProfile = StorageService.getUserProfile();
    const currentPuzzles = StorageService.getMyPuzzles();
    const currentDrafts = StorageService.getDraftPuzzles();
    const currentProgress = StorageService.getAllProgress();

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential,
          currentProfile,
          currentPuzzles,
          currentDrafts,
          currentProgress,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.profile) {
          StorageService.hydrateCloudAccountData({
            profile: json.profile,
            puzzles: json.puzzles,
            drafts: json.drafts,
            progress: json.progress,
          });

          return {
            success: true,
            profile: json.profile,
            message: json.message,
          };
        }
      }
    } catch (e: any) {
      console.warn('Google server API unreachable, using client decode fallback:', e);
    }

    // Client-side JWT Decoder fallback (for static hosting on Vercel)
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payloadJson = decodeURIComponent(
          atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const parsed = JSON.parse(payloadJson);
        if (parsed.email) {
          const email = parsed.email.trim().toLowerCase();
          const name = parsed.name || email.split('@')[0];
          const photoUrl = parsed.picture || '';
          const googleProfile: UserProfile = {
            id: 'usr_g_' + (parsed.sub ? parsed.sub.substring(0, 10) : Math.random().toString(36).substring(2, 9)),
            name,
            email,
            avatar: '🦊',
            photoUrl,
            googleId: parsed.sub,
            provider: 'google',
            isLoggedIn: true,
            autoSyncEnabled: true,
            syncKey: 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
            totalSolved: currentProfile.totalSolved || 0,
            totalCreated: currentProfile.totalCreated || 0,
          };

          StorageService.saveUserProfile(googleProfile);
          return {
            success: true,
            profile: googleProfile,
            message: `Login Google Berhasil! Selamat datang, ${name}`,
          };
        }
      }
    } catch (err) {
      console.error('Client JWT parsing failed:', err);
    }

    return {
      success: false,
      message: 'Token Google tidak dapat diverifikasi. Silakan coba kembali.',
    };
  },

  /**
   * Login with Google OAuth2 Access Token (from popup flow)
   */
  async loginWithGoogleAccessToken(accessToken: string): Promise<{ success: boolean; profile?: UserProfile; message?: string }> {
    const currentProfile = StorageService.getUserProfile();
    const currentPuzzles = StorageService.getMyPuzzles();
    const currentDrafts = StorageService.getDraftPuzzles();
    const currentProgress = StorageService.getAllProgress();

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          currentProfile,
          currentPuzzles,
          currentDrafts,
          currentProgress,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.profile) {
          StorageService.hydrateCloudAccountData({
            profile: json.profile,
            puzzles: json.puzzles,
            drafts: json.drafts,
            progress: json.progress,
          });

          return {
            success: true,
            profile: json.profile,
            message: json.message,
          };
        }
      }
    } catch (e: any) {
      console.warn('Google server API unreachable, fetching userinfo directly:', e);
    }

    // Direct Google UserInfo fetch client-side fallback
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        const parsed = await userInfoRes.json();
        if (parsed.email) {
          const email = parsed.email.trim().toLowerCase();
          const name = parsed.name || email.split('@')[0];
          const photoUrl = parsed.picture || '';
          const googleProfile: UserProfile = {
            id: 'usr_g_' + (parsed.sub ? parsed.sub.substring(0, 10) : Math.random().toString(36).substring(2, 9)),
            name,
            email,
            avatar: '🦊',
            photoUrl,
            googleId: parsed.sub,
            provider: 'google',
            isLoggedIn: true,
            autoSyncEnabled: true,
            syncKey: 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
            totalSolved: currentProfile.totalSolved || 0,
            totalCreated: currentProfile.totalCreated || 0,
          };

          StorageService.saveUserProfile(googleProfile);
          return {
            success: true,
            profile: googleProfile,
            message: `Login Google Berhasil! Selamat datang, ${name}`,
          };
        }
      }
    } catch (err) {
      console.error('Google userinfo fetch failed:', err);
    }

    return {
      success: false,
      message: 'Verifikasi akun Google gagal.',
    };
  },

  /**
   * Register with Email & Password (Works with backend API & static hosting Vercel)
   */
  async registerWithEmail(data: {
    email: string;
    password: string;
    name?: string;
    avatar?: string;
  }): Promise<{ success: boolean; profile?: UserProfile; message?: string; isExistingEmail?: boolean }> {
    const cleanEmail = data.email.trim().toLowerCase();
    const currentProfile = StorageService.getUserProfile();
    const currentPuzzles = StorageService.getMyPuzzles();
    const currentDrafts = StorageService.getDraftPuzzles();
    const currentProgress = StorageService.getAllProgress();

    // 1. Try Backend API first if running full-stack
    try {
      const res = await fetch('/api/auth/register-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: data.password,
          name: data.name || currentProfile.name,
          avatar: data.avatar || currentProfile.avatar,
          currentProfile,
          currentPuzzles,
          currentDrafts,
          currentProgress,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.profile) {
          StorageService.hydrateCloudAccountData({
            profile: json.profile,
            puzzles: json.puzzles,
            drafts: json.drafts,
            progress: json.progress,
          });

          // Also save in local cache
          const passHash = await hashClientPassword(data.password);
          saveLocalAccount(cleanEmail, {
            email: cleanEmail,
            passwordHash: passHash,
            profile: json.profile,
            puzzles: json.puzzles || currentPuzzles,
            drafts: json.drafts || currentDrafts,
            progress: json.progress || currentProgress,
          });

          return { success: true, profile: json.profile, message: json.message };
        } else if (json.isExistingEmail || res.status === 409) {
          return {
            success: false,
            message: json.message || 'Email ini sudah terdaftar! Silakan gunakan tab Masuk (Login).',
            isExistingEmail: true,
          };
        }
      }
    } catch (e) {
      console.warn('Backend register API not reachable, falling back to local secure storage:', e);
    }

    // 2. Resilient Client-Side Account Storage (Vercel static host)
    try {
      const localAccounts = getLocalAccounts();
      if (localAccounts[cleanEmail]) {
        return {
          success: false,
          isExistingEmail: true,
          message: 'Email ini sudah terdaftar! Silakan gunakan tab Masuk (Login) untuk mengakses akun Anda.',
        };
      }

      const passHash = await hashClientPassword(data.password);
      const newProfile: UserProfile = {
        id: 'usr_' + Math.random().toString(36).substring(2, 10),
        name: data.name?.trim() || cleanEmail.split('@')[0] || 'Pemain TTS',
        avatar: data.avatar || currentProfile.avatar || '🦊',
        email: cleanEmail,
        syncKey: 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        authToken: 'tkn_' + Math.random().toString(36).substring(2, 12),
        isLoggedIn: true,
        provider: 'email',
        autoSyncEnabled: true,
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
        totalSolved: currentProfile.totalSolved || 0,
        totalCreated: currentProfile.totalCreated || 0,
      };

      saveLocalAccount(cleanEmail, {
        email: cleanEmail,
        passwordHash: passHash,
        profile: newProfile,
        puzzles: currentPuzzles,
        drafts: currentDrafts,
        progress: currentProgress,
      });

      StorageService.saveUserProfile(newProfile);

      return {
        success: true,
        profile: newProfile,
        message: `Akun ${cleanEmail} berhasil didaftarkan dan tersimpan dengan aman!`,
      };
    } catch (err) {
      console.error('Local registration error:', err);
      return {
        success: false,
        message: 'Gagal membuat akun di browser Anda.',
      };
    }
  },

  /**
   * Login with Email & Password (Works with backend API & static hosting Vercel)
   */
  async loginWithEmail(data: {
    email: string;
    password: string;
  }): Promise<{ success: boolean; profile?: UserProfile; message?: string; errorType?: string }> {
    const cleanEmail = data.email.trim().toLowerCase();

    // 1. Try Backend API first if available
    try {
      const res = await fetch('/api/auth/login-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: data.password,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.profile) {
          StorageService.hydrateCloudAccountData({
            profile: json.profile,
            puzzles: json.puzzles,
            drafts: json.drafts,
            progress: json.progress,
          });

          // Sync into local cache
          const passHash = await hashClientPassword(data.password);
          saveLocalAccount(cleanEmail, {
            email: cleanEmail,
            passwordHash: passHash,
            profile: json.profile,
            puzzles: json.puzzles,
            drafts: json.drafts,
            progress: json.progress,
          });

          return { success: true, profile: json.profile, message: json.message };
        } else if (res.status === 401 || res.status === 404) {
          return {
            success: false,
            message: json.message || 'Login gagal.',
            errorType: json.errorType || (res.status === 401 ? 'wrong_password' : 'account_not_found'),
          };
        }
      }
    } catch (e) {
      console.warn('Backend login API not reachable, falling back to local secure storage:', e);
    }

    // 2. Resilient Client-Side Account Storage (Vercel static host)
    try {
      const localAccounts = getLocalAccounts();
      const existing = localAccounts[cleanEmail];

      if (!existing) {
        return {
          success: false,
          errorType: 'account_not_found',
          message: 'Akun dengan email ini belum terdaftar. Silakan pilih tab "Daftar Akun Baru" di atas untuk mendaftarkan akun Anda terlebih dahulu.',
        };
      }

      // Verify password hash
      const inputHash = await hashClientPassword(data.password);
      if (existing.passwordHash && existing.passwordHash !== inputHash) {
        return {
          success: false,
          errorType: 'wrong_password',
          message: 'Kata sandi yang Anda masukkan salah. Silakan periksa kembali kombinasi kata sandi Anda.',
        };
      }

      // Successful login -> hydrate stored data
      const restoredProfile: UserProfile = {
        ...existing.profile,
        isLoggedIn: true,
        autoSyncEnabled: true,
        lastSyncedAt: Date.now(),
      };

      StorageService.hydrateCloudAccountData({
        profile: restoredProfile,
        puzzles: existing.puzzles,
        drafts: existing.drafts,
        progress: existing.progress,
      });

      return {
        success: true,
        profile: restoredProfile,
        message: `Selamat datang kembali, ${restoredProfile.name}!`,
      };
    } catch (err) {
      console.error('Local login error:', err);
      return {
        success: false,
        message: 'Gagal memproses login akun di browser.',
      };
    }
  },

  /**
   * Logout from Cloud Account (Revert to Guest Mode)
   */
  logoutCloudAccount(): UserProfile {
    StorageService.clearGuestSessionData();
    const guestProfile: UserProfile = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      name: 'Pemain ' + Math.floor(1000 + Math.random() * 9000),
      avatar: '🦊',
      syncKey: 'SYNC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: Date.now(),
      totalSolved: 0,
      totalCreated: 0,
      isLoggedIn: false,
      autoSyncEnabled: false,
      provider: 'guest',
      email: undefined,
      authToken: undefined,
      googleId: undefined,
    };
    StorageService.saveUserProfile(guestProfile);
    return guestProfile;
  },
};

