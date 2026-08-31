import { AdminSession, GlobalAnnouncement, CrosswordPuzzle, LeaderboardEntry } from '../types/tts';

const API_BASE = '/api';
const ADMIN_SESSION_KEY = 'tts_admin_session';

export interface AdminStats {
  totalUsers: number;
  totalPuzzles: number;
  featuredPuzzles: number;
  draftPuzzles: number;
  totalLeaderboardRecords: number;
  totalComments: number;
  totalReactions: number;
  supabaseConfigured: boolean;
  supabaseConnected: boolean;
  supabaseTablesReady?: boolean;
  supabaseStatusDetails?: {
    configured: boolean;
    connected: boolean;
    tablesReady: boolean;
    url?: string;
    maskedKey?: string;
    tables?: {
      puzzles: boolean;
      user_accounts: boolean;
      leaderboard: boolean;
      profiles: boolean;
    };
    tableDetails?: {
      puzzlesError?: string;
      usersError?: string;
      leaderboardError?: string;
      profilesError?: string;
    };
    error?: string;
  };
  serverUptimeSec: number;
  memoryUsageMb: number;
  nodeVersion: string;
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  avatar: string;
  photoUrl?: string;
  provider: 'google' | 'email' | 'guest';
  syncKey: string;
  totalSolved: number;
  totalCreated: number;
  puzzlesCount: number;
  draftsCount: number;
  createdAt: number;
  lastSyncedAt: number;
  isBanned: boolean;
  role?: 'admin' | 'user';
}

export interface AdminCommentItem {
  id: string;
  puzzleId: string;
  puzzleTitle: string;
  puzzleAuthor: string;
  authorName: string;
  authorAvatar: string;
  authorEmail?: string;
  content: string;
  createdAt: number;
}

export interface AdminLeaderboardItem extends LeaderboardEntry {
  puzzleTitle: string;
}

export const AdminService = {
  /**
   * Get current stored admin session
   */
  getSession(): AdminSession | null {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      if (!raw) return null;
      const session: AdminSession = JSON.parse(raw);
      if (session.expiresAt && session.expiresAt < Date.now()) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },

  /**
   * Save admin session
   */
  saveSession(session: AdminSession): void {
    try {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('Could not save admin session to storage:', e);
    }
  },

  /**
   * Logout administrator
   */
  async logout(): Promise<void> {
    const session = this.getSession();
    if (session?.token) {
      try {
        await fetch(`${API_BASE}/admin/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.token}` },
        });
      } catch (err) {
        console.warn('Logout network error:', err);
      }
    }
    localStorage.removeItem(ADMIN_SESSION_KEY);
  },

  /**
   * Check if admin token is valid
   */
  isLoggedIn(): boolean {
    const session = this.getSession();
    return !!session && session.expiresAt > Date.now();
  },

  /**
   * Get stored Supabase credentials from local storage
   */
  getStoredSupabaseConfig(): { url: string; key: string } {
    try {
      const url = localStorage.getItem('tts_supabase_url') || '';
      const key = localStorage.getItem('tts_supabase_key') || '';
      return { url: url.trim(), key: key.trim() };
    } catch {
      return { url: '', key: '' };
    }
  },

  /**
   * Save Supabase credentials to local storage
   */
  saveStoredSupabaseConfig(url: string, key: string): void {
    try {
      if (url) localStorage.setItem('tts_supabase_url', url.trim());
      if (key) localStorage.setItem('tts_supabase_key', key.trim());
    } catch (e) {
      console.warn('Could not save Supabase config to local storage:', e);
    }
  },

  /**
   * Get HTTP Headers for authorized admin requests
   */
  getHeaders(): Record<string, string> {
    const session = this.getSession();
    const sbConfig = this.getStoredSupabaseConfig();

    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(session?.token ? { 'Authorization': `Bearer ${session.token}` } : {}),
      ...(sbConfig.url ? { 'x-supabase-url': sbConfig.url } : {}),
      ...(sbConfig.key ? { 'x-supabase-key': sbConfig.key } : {}),
    };
  },

  /**
   * Login with Administrator credentials
   */
  async login(username: string, password: string): Promise<{ success: boolean; message: string; session?: AdminSession }> {
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch (parseErr) {
        // If server returned non-json (e.g. 500 HTML)
        console.warn('Could not parse server response as JSON:', parseErr);
      }

      if (res.ok && json && json.success) {
        const session: AdminSession = {
          token: json.token,
          username: json.username || username,
          expiresAt: json.expiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        this.saveSession(session);
        return { success: true, message: json.message, session };
      }

      if (json && json.message) {
        return { success: false, message: json.message };
      }


      return { success: false, message: `Gagal login (HTTP ${res.status}): Kombinasi username atau password salah.` };
    } catch (err: any) {
      console.error('Admin login exception:', err);
      return { success: false, message: 'Gagal terhubung ke server cloud. Periksa koneksi internet Anda.' };
    }
  },

  /**
   * Verify token validity
   */
  async verifySession(): Promise<boolean> {
    if (!this.isLoggedIn()) return false;
    try {
      const res = await fetch(`${API_BASE}/admin/verify`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        return Boolean(json.success);
      }
    } catch {
      // offline fallback check
    }
    return this.isLoggedIn();
  },

  /**
   * Fetch overview statistics
   */
  async getStats(): Promise<AdminStats | null> {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.stats;
      }
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    }
    return null;
  },

  /**
   * Trigger on-demand sync with Supabase
   */
  async syncNow(): Promise<{ success: boolean; message: string; stats?: any }> {
    try {
      const res = await fetch(`${API_BASE}/admin/sync`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return {
        success: Boolean(json.success),
        message: json.message || 'Sinkronisasi selesai.',
        stats: json.stats,
      };
    } catch (err: any) {
      return { success: false, message: 'Gagal menghubungi server untuk sinkronisasi.' };
    }
  },

  /**
   * Check Supabase Cloud connection status details
   */
  async getSupabaseStatus(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/supabase/status`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch {
      // ignore
    }
    return null;
  },

  /**
   * Update and save Supabase credentials directly from Admin
   */
  async updateSupabaseConfig(url: string, key: string): Promise<{ success: boolean; message: string; status?: any }> {
    const cleanUrl = url.trim();
    const cleanKey = key.trim();

    // Cache locally immediately so browser never loses it
    this.saveStoredSupabaseConfig(cleanUrl, cleanKey);

    try {
      const res = await fetch(`${API_BASE}/admin/supabase-config`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ url: cleanUrl, key: cleanKey }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // non-json response
      }

      if (json) {
        return {
          success: Boolean(json.success),
          message: json.message || (res.ok ? 'Konfigurasi berhasil disimpan.' : 'Gagal menyimpan konfigurasi.'),
          status: json.status,
        };
      }

      return {
        success: res.ok,
        message: res.ok ? 'Konfigurasi disimpan di cache lokal.' : `Server merespons status ${res.status}`,
      };
    } catch (err: any) {
      // JANGAN klaim sukses — config belum tentu tersimpan di server,
      // hanya di cache browser ini. Pola "selalu bilang sukses" ini pernah
      // menyebabkan bug serupa di syncService.ts (lihat riwayat perbaikan).
      return {
        success: false,
        message: 'Konfigurasi hanya tersimpan di cache browser ini — gagal menghubungi server (server offline/tidak terjangkau). Instance server lain TIDAK akan menerima config ini. Coba lagi saat koneksi normal, atau set lewat Vercel Environment Variables.',
      };
    }
  },

  /**
   * Fetch all registered user accounts
   */
  async getUsers(): Promise<AdminUserItem[]> {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
    return [];
  },

  /**
   * Update user details or toggle ban status
   */
  async updateUser(id: string, data: Partial<AdminUserItem>): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message || 'Perubahan disimpan.' };
    } catch (err) {
      return { success: false, message: 'Gagal menghubungi server.' };
    }
  },

  /**
   * Reset user password
   */
  async resetUserPassword(id: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ newPassword }),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message || 'Kata sandi berhasil direset.' };
    } catch (err) {
      return { success: false, message: 'Gagal mereset kata sandi.' };
    }
  },

  /**
   * Delete user account permanently
   */
  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message || 'Akun pengguna berhasil dihapus.' };
    } catch (err) {
      return { success: false, message: 'Gagal menghapus pengguna.' };
    }
  },

  /**
   * Fetch all community puzzles for moderation
   */
  async getPuzzles(): Promise<CrosswordPuzzle[]> {
    try {
      const res = await fetch(`${API_BASE}/admin/puzzles`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (err) {
      console.error('Error fetching admin puzzles:', err);
    }
    return [];
  },

  /**
   * Toggle Featured status (Pilihan Editor)
   */
  async toggleFeaturePuzzle(id: string): Promise<{ success: boolean; isFeatured?: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/puzzles/${encodeURIComponent(id)}/toggle-feature`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return { success: Boolean(json.success), isFeatured: json.isFeatured, message: json.message };
    } catch (err) {
      return { success: false, message: 'Gagal mengubah status Pilihan Editor.' };
    }
  },

  /**
   * Edit puzzle metadata
   */
  async updatePuzzle(id: string, data: Partial<CrosswordPuzzle>): Promise<{ success: boolean; message: string; data?: CrosswordPuzzle }> {
    try {
      const res = await fetch(`${API_BASE}/admin/puzzles/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(data),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message, data: json.data };
    } catch (err) {
      return { success: false, message: 'Gagal memperbarui teka-teki.' };
    }
  },

  /**
   * Permanently delete a puzzle
   */
  async deletePuzzle(id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/puzzles/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message || 'Teka-teki berhasil dihapus.' };
    } catch (err) {
      return { success: false, message: 'Gagal menghapus teka-teki.' };
    }
  },

  /**
   * Get all comments across all puzzles
   */
  async getComments(): Promise<AdminCommentItem[]> {
    try {
      const res = await fetch(`${API_BASE}/admin/comments`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (err) {
      console.error('Error fetching admin comments:', err);
    }
    return [];
  },

  /**
   * Delete a comment
   */
  async deleteComment(puzzleId: string, commentId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/comments/${encodeURIComponent(puzzleId)}/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message };
    } catch (err) {
      return { success: false, message: 'Gagal menghapus komentar.' };
    }
  },

  /**
   * Get all leaderboard speedrun scores
   */
  async getLeaderboards(): Promise<AdminLeaderboardItem[]> {
    try {
      const res = await fetch(`${API_BASE}/admin/leaderboards`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (err) {
      console.error('Error fetching admin leaderboards:', err);
    }
    return [];
  },

  /**
   * Delete a leaderboard score entry
   */
  async deleteLeaderboardEntry(puzzleId: string, id: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/leaderboards/${encodeURIComponent(puzzleId)}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message };
    } catch (err) {
      return { success: false, message: 'Gagal menghapus skor.' };
    }
  },

  /**
   * Get announcement configuration
   */
  async getAnnouncement(): Promise<GlobalAnnouncement | null> {
    try {
      const res = await fetch(`${API_BASE}/admin/announcement`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) return json.data;
      }
    } catch (err) {
      console.error('Error fetching announcement:', err);
    }
    return null;
  },

  /**
   * Save global announcement
   */
  async saveAnnouncement(announcement: GlobalAnnouncement): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin/announcement`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(announcement),
      });
      const json = await res.json();
      return { success: Boolean(json.success), message: json.message };
    } catch (err) {
      return { success: false, message: 'Gagal menyimpan pengumuman.' };
    }
  },

  /**
   * Public fetch of active announcement for regular users
   */
  async getPublicAnnouncement(): Promise<GlobalAnnouncement | null> {
    try {
      const res = await fetch(`${API_BASE}/announcement`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && json.data.isActive && json.data.message) {
          return json.data;
        }
      }
    } catch {
      // offline or silent
    }
    return null;
  },
};
