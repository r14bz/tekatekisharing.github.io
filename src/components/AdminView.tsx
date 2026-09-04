import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  Users,
  Grid,
  Trophy,
  MessageSquare,
  Megaphone,
  BarChart3,
  RefreshCw,
  LogOut,
  ArrowLeft,
  Search,
  KeyRound,
  Ban,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Star,
  Eye,
  EyeOff,
  Database,
  Server,
  Sparkles,
  ExternalLink,
  Flame,
  Clock,
  Heart,
  HelpCircle,
  Settings,
  Edit,
  Save,
  X,
  Code,
  Copy,
} from 'lucide-react';
import {
  AdminService,
  AdminStats,
  AdminUserItem,
  AdminCommentItem,
  AdminLeaderboardItem,
} from '../services/adminService';
import { CrosswordPuzzle, GlobalAnnouncement, UserProfile } from '../types/tts';

interface AdminViewProps {
  onBackToApp: () => void;
  onPlayPuzzle?: (puzzle: CrosswordPuzzle) => void;
  userProfile?: UserProfile;
}

type AdminTab = 'overview' | 'users' | 'puzzles' | 'comments' | 'leaderboards' | 'announcement' | 'ai-generator';

export const AdminView: React.FC<AdminViewProps> = ({ onBackToApp, onPlayPuzzle }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => AdminService.isLoggedIn());
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Login Form States
  const [loginUsername, setLoginUsername] = useState<string>('Administrator');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Admin Data States
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [puzzles, setPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [comments, setComments] = useState<AdminCommentItem[]>([]);
  const [leaderboards, setLeaderboards] = useState<AdminLeaderboardItem[]>([]);
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement>({
    message: '',
    isActive: false,
    type: 'info',
    updatedAt: Date.now(),
  });

  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Modals & Sub-states
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserItem | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUserItem | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [editingPuzzle, setEditingPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'user' | 'puzzle' | 'comment' | 'leaderboard';
    id: string;
    secondaryId?: string;
    title: string;
  } | null>(null);

  // Filter & Search states
  const [userSearch, setUserSearch] = useState<string>('');
  const [userProviderFilter, setUserProviderFilter] = useState<'all' | 'email' | 'google'>('all');
  const [puzzleSearch, setPuzzleSearch] = useState<string>('');
  const [puzzleFilter, setPuzzleFilter] = useState<'all' | 'featured' | 'drafts'>('all');
  const [commentSearch, setCommentSearch] = useState<string>('');
  const [leaderboardSearch, setLeaderboardSearch] = useState<string>('');
  const [showSqlSchemaModal, setShowSqlSchemaModal] = useState<boolean>(false);
  const [showSupabaseConfigModal, setShowSupabaseConfigModal] = useState<boolean>(false);
  const [isCopiedSql, setIsCopiedSql] = useState<boolean>(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState<string>(() => {
    return AdminService.getStoredSupabaseConfig().url || 'https://toacghkgrocxfzkstorp.supabase.co';
  });
  const [supabaseKeyInput, setSupabaseKeyInput] = useState<string>(() => {
    return AdminService.getStoredSupabaseConfig().key || '';
  });
  const [isSavingSupabase, setIsSavingSupabase] = useState<boolean>(false);

  // ---- AI Generator states ----
  const [aiDrafts, setAiDrafts] = useState<CrosswordPuzzle[]>([]);
  const [aiTopic, setAiTopic] = useState<string>('');
  const [aiWordCount, setAiWordCount] = useState<number>(12);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiGenerateResult, setAiGenerateResult] = useState<string | null>(null);
  const [editingAiDraft, setEditingAiDraft] = useState<CrosswordPuzzle | null>(null);
  const [aiDraftTitleInput, setAiDraftTitleInput] = useState<string>('');
  const [aiDraftDescInput, setAiDraftDescInput] = useState<string>('');
  const [aiDraftClueInputs, setAiDraftClueInputs] = useState<Record<string, string>>({});
  const [aiDraftAuthorInput, setAiDraftAuthorInput] = useState<string>('Tim Teka Teki Sharing');
  const [isSavingAiDraft, setIsSavingAiDraft] = useState<boolean>(false);
  const [isPublishingAiDraft, setIsPublishingAiDraft] = useState<boolean>(false);

  const loadAiDrafts = async () => {
    const res = await AdminService.getAiDrafts();
    if (res.success) setAiDrafts(res.data as CrosswordPuzzle[]);
  };

  // Load Admin Data on mount or when logged in
  useEffect(() => {
    if (isAdminLoggedIn) {
      const stored = AdminService.getStoredSupabaseConfig();
      if (stored.url && !supabaseUrlInput) setSupabaseUrlInput(stored.url);
      if (stored.key && !supabaseKeyInput) setSupabaseKeyInput(stored.key);
      loadAllAdminData();
    }
  }, [isAdminLoggedIn]);

  const loadAllAdminData = async () => {
    setIsLoadingData(true);
    try {
      const [statsData, usersData, puzzlesData, commentsData, leaderboardsData, annData] = await Promise.all([
        AdminService.getStats(),
        AdminService.getUsers(),
        AdminService.getPuzzles(),
        AdminService.getComments(),
        AdminService.getLeaderboards(),
        AdminService.getAnnouncement(),
      ]);

      if (statsData) {
        setStats(statsData);
        if (statsData.supabaseStatusDetails?.url && !supabaseUrlInput) {
          setSupabaseUrlInput(statsData.supabaseStatusDetails.url);
        }
      }
      setUsers(usersData);
      setPuzzles(puzzlesData);
      setComments(commentsData);
      setLeaderboards(leaderboardsData);
      if (annData) setAnnouncement(annData);
      await loadAiDrafts();
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = supabaseUrlInput.trim();
    const cleanKey = supabaseKeyInput.trim();

    if (!cleanUrl || !cleanKey) {
      showNotification('URL dan API Key Supabase wajib diisi.', 'error');
      return;
    }

    setIsSavingSupabase(true);
    try {
      const res = await AdminService.updateSupabaseConfig(cleanUrl, cleanKey);
      if (res.success) {
        showNotification(res.message, 'success');
        setShowSupabaseConfigModal(false);
      } else {
        showNotification(res.message || 'Gagal menyimpan konfigurasi.', 'error');
      }
      await loadAllAdminData();
    } catch (err: any) {
      // JANGAN klaim sukses di sini — exception yang sampai kemari berarti
      // ada kegagalan nyata (AdminService.updateSupabaseConfig sendiri
      // sudah menangani error jaringan secara internal dan mengembalikan
      // {success:false}, jadi catch ini hanya untuk error tak terduga).
      showNotification('Gagal menyimpan konfigurasi Supabase. Coba lagi.', 'error');
    } finally {
      setIsSavingSupabase(false);
    }
  };

  const handleForceSync = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await AdminService.syncNow();
      if (res.success) {
        showNotification(res.message, 'success');
      } else {
        showNotification(res.message, 'error');
      }
      await loadAllAdminData();
    } catch (e: any) {
      showNotification('Gagal memicu sinkronisasi.', 'error');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const [isBackfillingCompletions, setIsBackfillingCompletions] = useState<boolean>(false);
  const handleBackfillCompletions = async () => {
    setIsBackfillingCompletions(true);
    try {
      const res = await AdminService.backfillCompletions();
      showNotification(res.message, res.success ? 'success' : 'error');
      if (res.success) await loadAllAdminData();
    } catch (e: any) {
      showNotification('Gagal menjalankan backfill statistik penyelesaian.', 'error');
    } finally {
      setIsBackfillingCompletions(false);
    }
  };

  // ---- AI Generator handlers ----
  const handleGenerateAiPuzzle = async () => {
    const topic = aiTopic.trim();
    if (!topic) {
      showNotification('Topik tidak boleh kosong.', 'error');
      return;
    }
    setIsGeneratingAi(true);
    setAiGenerateResult(null);
    try {
      const res = await AdminService.generatePuzzle(topic, aiWordCount);
      if (res.success) {
        setAiGenerateResult(
          `✅ Berhasil! ${res.wordsPlaced || 0} dari ${res.wordsRequested || aiWordCount} kata tersusun jadi grid.`
        );
        setAiTopic('');
        await loadAiDrafts();
      } else {
        setAiGenerateResult(`❌ ${res.message}`);
      }
      showNotification(res.message, res.success ? 'success' : 'error');
    } catch (e: any) {
      showNotification('Gagal menghubungi server untuk generate TTS.', 'error');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const openAiDraftEditor = (draft: CrosswordPuzzle) => {
    setEditingAiDraft(draft);
    setAiDraftTitleInput(draft.title);
    setAiDraftDescInput(draft.description || '');
    const clueMap: Record<string, string> = {};
    (draft.clues || []).forEach((c: any) => { clueMap[c.id] = c.question; });
    setAiDraftClueInputs(clueMap);
    setAiDraftAuthorInput('Tim Teka Teki Sharing');
  };

  const handleSaveAiDraft = async () => {
    if (!editingAiDraft) return;
    setIsSavingAiDraft(true);
    try {
      const clues = Object.entries(aiDraftClueInputs).map(([id, question]) => ({ id, question }));
      const res = await AdminService.updateAiDraft(editingAiDraft.id, {
        title: aiDraftTitleInput,
        description: aiDraftDescInput,
        clues,
      });
      showNotification(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        await loadAiDrafts();
        if (res.data) setEditingAiDraft(res.data as CrosswordPuzzle);
      }
    } catch (e: any) {
      showNotification('Gagal menyimpan draft AI.', 'error');
    } finally {
      setIsSavingAiDraft(false);
    }
  };

  const handlePublishAiDraft = async () => {
    if (!editingAiDraft) return;
    setIsPublishingAiDraft(true);
    try {
      // Simpan dulu perubahan terbaru sebelum publish, supaya tidak ada
      // edit yang tertinggal.
      const clues = Object.entries(aiDraftClueInputs).map(([id, question]) => ({ id, question }));
      await AdminService.updateAiDraft(editingAiDraft.id, {
        title: aiDraftTitleInput,
        description: aiDraftDescInput,
        clues,
      });
      const res = await AdminService.publishAiDraft(editingAiDraft.id, aiDraftAuthorInput);
      showNotification(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        setEditingAiDraft(null);
        await loadAiDrafts();
        await loadAllAdminData();
      }
    } catch (e: any) {
      showNotification('Gagal mempublikasikan draft AI.', 'error');
    } finally {
      setIsPublishingAiDraft(false);
    }
  };

  const handleDeleteAiDraft = (draft: CrosswordPuzzle) => {
    setDeleteConfirm({ type: 'puzzle', id: draft.id, title: `draft AI "${draft.title}"` });
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => {
      setActionMessage(null);
    }, 4000);
  };

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      setLoginError('Username dan password wajib diisi.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);

    const result = await AdminService.login(loginUsername, loginPassword);
    setIsLoggingIn(false);

    if (result.success) {
      setIsAdminLoggedIn(true);
      setLoginPassword('');
      showNotification('Selamat datang di Panel Administrator!', 'success');
    } else {
      setLoginError(result.message);
    }
  };

  const handleLogout = async () => {
    await AdminService.logout();
    setIsAdminLoggedIn(false);
    showNotification('Berhasil keluar dari sesi Administrator.');
  };

  // User Actions
  const handleToggleUserBan = async (user: AdminUserItem) => {
    const nextStatus = !user.isBanned;
    const res = await AdminService.updateUser(user.id, { isBanned: nextStatus });
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isBanned: nextStatus } : u))
      );
      showNotification(
        nextStatus ? `Akun ${user.email} berhasil diblokir.` : `Blokir akun ${user.email} dibuka.`
      );
    } else {
      showNotification(res.message, 'error');
    }
  };

  const handleResetPasswordSubmit = async () => {
    if (!resetPasswordUser || !newPasswordInput || newPasswordInput.length < 6) {
      showNotification('Kata sandi baru minimal 6 karakter.', 'error');
      return;
    }

    const res = await AdminService.resetUserPassword(resetPasswordUser.id, newPasswordInput);
    if (res.success) {
      showNotification(res.message, 'success');
      setResetPasswordUser(null);
      setNewPasswordInput('');
    } else {
      showNotification(res.message, 'error');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const res = await AdminService.deleteUser(userId);
    if (res.success) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showNotification(res.message, 'success');
      setDeleteConfirm(null);
      if (selectedUserDetail?.id === userId) setSelectedUserDetail(null);
    } else {
      showNotification(res.message, 'error');
    }
  };

  // Puzzle Actions
  const handleToggleFeaturePuzzle = async (puzzle: CrosswordPuzzle) => {
    const res = await AdminService.toggleFeaturePuzzle(puzzle.id);
    if (res.success) {
      setPuzzles((prev) =>
        prev.map((p) => (p.id === puzzle.id ? { ...p, isFeatured: res.isFeatured } : p))
      );
      showNotification(res.message, 'success');
    } else {
      showNotification(res.message, 'error');
    }
  };

  const handleSavePuzzleEdit = async () => {
    if (!editingPuzzle) return;
    const res = await AdminService.updatePuzzle(editingPuzzle.id, {
      title: editingPuzzle.title,
      description: editingPuzzle.description,
      category: editingPuzzle.category,
      difficulty: editingPuzzle.difficulty,
      isFeatured: editingPuzzle.isFeatured,
    });
    if (res.success && res.data) {
      setPuzzles((prev) => prev.map((p) => (p.id === editingPuzzle.id ? res.data! : p)));
      showNotification('Teka-teki berhasil diperbarui!', 'success');
      setEditingPuzzle(null);
    } else {
      showNotification(res.message, 'error');
    }
  };

  const handleDeletePuzzle = async (puzzleId: string) => {
    const res = await AdminService.deletePuzzle(puzzleId);
    if (res.success) {
      setPuzzles((prev) => prev.filter((p) => p.id !== puzzleId));
      setAiDrafts((prev) => prev.filter((p) => p.id !== puzzleId));
      if (editingAiDraft?.id === puzzleId) setEditingAiDraft(null);
      showNotification(res.message, 'success');
      setDeleteConfirm(null);
    } else {
      showNotification(res.message, 'error');
    }
  };

  // Comment Actions
  const handleDeleteComment = async (puzzleId: string, commentId: string) => {
    const res = await AdminService.deleteComment(puzzleId, commentId);
    if (res.success) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      showNotification('Komentar berhasil dihapus.', 'success');
      setDeleteConfirm(null);
    } else {
      showNotification(res.message, 'error');
    }
  };

  // Leaderboard Actions
  const handleDeleteLeaderboard = async (puzzleId: string, entryId: string) => {
    const res = await AdminService.deleteLeaderboardEntry(puzzleId, entryId);
    if (res.success) {
      setLeaderboards((prev) => prev.filter((l) => l.id !== entryId));
      showNotification('Rekor skor berhasil dihapus dari leaderboard.', 'success');
      setDeleteConfirm(null);
    } else {
      showNotification(res.message, 'error');
    }
  };

  // Announcement Actions
  const handleSaveAnnouncement = async () => {
    const res = await AdminService.saveAnnouncement(announcement);
    if (res.success) {
      showNotification('Pengumuman global berhasil disimpan!', 'success');
    } else {
      showNotification(res.message, 'error');
    }
  };

  // =========================================================================
  // VIEW: IF NOT LOGGED IN -> SHOW ADMIN LOGIN FORM
  // =========================================================================
  if (!isAdminLoggedIn) {
    return (
      <div className="w-full min-h-[85vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl p-6 sm:p-8 relative overflow-hidden transition-all">
          {/* Background Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col items-center text-center relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Portal Administrator
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              Akses khusus untuk mengelola akun pengguna, teka-teki silang, leaderboard, dan moderasi konten.
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="mt-6 space-y-4 relative z-10">
            {loginError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Username Administrator
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Administrator"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Password Administrator
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Masukkan kata sandi admin..."
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Akses...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Masuk sebagai Administrator</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Back */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-center">
            <button
              type="button"
              onClick={onBackToApp}
              className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Permainan TTS</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW: LOGGED IN AS ADMINISTRATOR -> FULL CONTROL DASHBOARD
  // =========================================================================

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.toLowerCase().includes(userSearch.toLowerCase());
    const matchesProvider =
      userProviderFilter === 'all' || u.provider === userProviderFilter;
    return matchesSearch && matchesProvider;
  });

  // Filtered Puzzles
  const filteredPuzzles = puzzles.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(puzzleSearch.toLowerCase()) ||
      (p.customCode && p.customCode.toLowerCase().includes(puzzleSearch.toLowerCase())) ||
      p.authorName.toLowerCase().includes(puzzleSearch.toLowerCase());
    const matchesFilter =
      puzzleFilter === 'all' ||
      (puzzleFilter === 'featured' && p.isFeatured) ||
      (puzzleFilter === 'drafts' && p.isDraft);
    return matchesSearch && matchesFilter;
  });

  // Filtered Comments
  const filteredComments = comments.filter((c) => {
    return (
      c.content.toLowerCase().includes(commentSearch.toLowerCase()) ||
      c.authorName.toLowerCase().includes(commentSearch.toLowerCase()) ||
      c.puzzleTitle.toLowerCase().includes(commentSearch.toLowerCase())
    );
  });

  // Filtered Leaderboards
  const filteredLeaderboards = leaderboards.filter((l) => {
    return (
      l.playerName.toLowerCase().includes(leaderboardSearch.toLowerCase()) ||
      l.puzzleTitle.toLowerCase().includes(leaderboardSearch.toLowerCase()) ||
      l.puzzleId.toLowerCase().includes(leaderboardSearch.toLowerCase())
    );
  });

  return (
    <div className="w-full flex-1 flex flex-col px-3 sm:px-4 py-4 max-w-6xl mx-auto space-y-4">
      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl shadow-xl border flex items-center gap-2.5 text-xs font-bold transition-all transform animate-in slide-in-from-bottom-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Top Admin Navigation Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Panel Administrator
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pusat kendali pengguna, teka-teki silang, leaderboard, dan moderasi konten.
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={loadAllAdminData}
            disabled={isLoadingData}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Muat ulang seluruh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin text-indigo-500' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={onBackToApp}
            className="px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Kembali ke tampilan utama aplikasi"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ke Aplikasi</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Keluar dari sesi administrator"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout Admin</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'overview', label: 'Ringkasan', icon: BarChart3 },
          { id: 'users', label: `Pengguna (${users.length})`, icon: Users },
          { id: 'puzzles', label: `Teka-Teki (${puzzles.length})`, icon: Grid },
          { id: 'comments', label: `Komentar (${comments.length})`, icon: MessageSquare },
          { id: 'leaderboards', label: `Papan Skor (${leaderboards.length})`, icon: Trophy },
          { id: 'announcement', label: 'Pengumuman Global', icon: Megaphone },
          { id: 'ai-generator', label: `🪄 Generator AI${aiDrafts.length ? ` (${aiDrafts.length})` : ''}`, icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: OVERVIEW & STATS */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* 4 Top Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-semibold">Total Pengguna</span>
                <Users className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {stats?.totalUsers || users.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>Terdaftar di Cloud DB</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-semibold">Total Teka-Teki</span>
                <Grid className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {stats?.totalPuzzles || puzzles.length}
              </div>
              <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 flex items-center gap-1">
                <span>{stats?.featuredPuzzles || 0} Pilihan Editor ⭐</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-semibold">Skor Tercatat</span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {stats?.totalLeaderboardRecords || leaderboards.length}
              </div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <span>Penyelesaian Speedrun</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                <span className="text-xs font-semibold">Interaksi & Komentar</span>
                <MessageSquare className="w-4 h-4 text-pink-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {stats?.totalComments || comments.length}
              </div>
              <div className="text-[11px] text-pink-600 dark:text-pink-400 mt-1 flex items-center gap-1">
                <span>{stats?.totalReactions || 0} Total Emoticon</span>
              </div>
            </div>
          </div>

          {/* System Status & Server Specs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Database & Cloud Status */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Status Database & Supabase Cloud
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSupabaseConfigModal(true)}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                  <span>Atur Kredensial</span>
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Penyimpanan Lokal (Cache)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                    Aktif & Otomatis Backup
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Koneksi Supabase Cloud</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      stats?.supabaseConnected && stats?.supabaseTablesReady
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : stats?.supabaseConnected
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}
                  >
                    {stats?.supabaseConnected && stats?.supabaseTablesReady
                      ? 'Terhubung & Aktif (Online)'
                      : stats?.supabaseConnected
                      ? 'Terhubung (Tabel Belum Dibuat)'
                      : 'Standby / Lokal'}
                  </span>
                </div>

                {/* Diagnostic Details if Configured */}
                {stats?.supabaseStatusDetails?.url && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/50 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span className="text-[10px] text-slate-400">Host Supabase:</span>
                      <span className="font-mono text-[10.5px] truncate max-w-[200px]">
                        {stats.supabaseStatusDetails.url.replace(/^https?:\/\//, '')}
                      </span>
                    </div>
                    {stats?.supabaseStatusDetails?.tables && (
                      <div className="pt-1 grid grid-cols-2 gap-1.5 text-[10px]">
                        <div className="flex items-center gap-1">
                          <span className={stats.supabaseStatusDetails.tables.puzzles ? 'text-emerald-500' : 'text-amber-500'}>
                            {stats.supabaseStatusDetails.tables.puzzles ? '●' : '○'}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">Tabel Puzzles</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={stats.supabaseStatusDetails.tables.user_accounts ? 'text-emerald-500' : 'text-amber-500'}>
                            {stats.supabaseStatusDetails.tables.user_accounts ? '●' : '○'}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">Tabel Akun Pengguna</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={stats.supabaseStatusDetails.tables.leaderboard ? 'text-emerald-500' : 'text-amber-500'}>
                            {stats.supabaseStatusDetails.tables.leaderboard ? '●' : '○'}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">Tabel Leaderboard</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={stats.supabaseStatusDetails.tables.profiles ? 'text-emerald-500' : 'text-amber-500'}>
                            {stats.supabaseStatusDetails.tables.profiles ? '●' : '○'}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">Tabel Profil</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Alert when tables missing */}
                {stats?.supabaseConnected && !stats?.supabaseTablesReady && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-[11px] text-blue-800 dark:text-blue-300 space-y-1.5">
                    <p className="font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      Kredensial Valid! Buat Tabel di SQL Editor:
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 text-[10.5px] leading-relaxed">
                      Server berhasil terhubung ke Supabase. Salin skrip SQL di bawah lalu jalankan sekali di <strong>SQL Editor</strong> Supabase Anda.
                    </p>
                  </div>
                )}

                {/* Alert when not connected */}
                {!stats?.supabaseConnected && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      Supabase Cloud Belum Terhubung:
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 text-[10.5px] leading-relaxed">
                      Klik <strong>Atur Kredensial</strong> di atas untuk memasukkan URL & Kunci API Supabase secara langsung, atau masukkan di <em>Settings ➔ Environment Variables</em> Vercel lalu klik <em>Redeploy</em>.
                    </p>
                  </div>
                )}

                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleForceSync}
                    disabled={isSyncingCloud}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                    <span>{isSyncingCloud ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSqlSchemaModal(true)}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/70 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Skrip SQL Supabase</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleBackfillCompletions}
                    disabled={isBackfillingCompletions}
                    title='Isi ulang statistik "Diselesaikan" dari data leaderboard yang sudah ada (aman dijalankan berkali-kali)'
                    className="w-full sm:col-span-2 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/70 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isBackfillingCompletions ? 'animate-spin' : ''}`} />
                    <span>{isBackfillingCompletions ? 'Menghitung ulang...' : 'Backfill Statistik "Diselesaikan"'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Server Runtime & Fast Shortcuts */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-purple-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Runtime & Akses Cepat
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800/80 text-left transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">👥 Kelola Pengguna</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Reset pass / Blokir akun</div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('puzzles')}
                  className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800/80 text-left transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-purple-700 dark:text-purple-300">🧩 Moderasi TTS</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Tandai Featured / Hapus</div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('comments')}
                  className="p-3 rounded-xl bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/40 border border-pink-200 dark:border-pink-800/80 text-left transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-pink-700 dark:text-pink-300">💬 Hapus Spam</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Bersihkan komentar kotor</div>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('announcement')}
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/80 text-left transition-all cursor-pointer"
                >
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-300">📢 Buat Pengumuman</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Banner pesan ke semua user</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: USER MANAGEMENT */}
      {/* ===================================================================== */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Daftar Akun Pengguna ({filteredUsers.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kelola status pengguna, reset kata sandi, dan tinjau aktivitas teka-teki mereka.
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Cari nama / email..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={userProviderFilter}
                onChange={(e: any) => setUserProviderFilter(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">Semua Provider</option>
                <option value="email">Email</option>
                <option value="google">Google</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          {filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              Tidak ada pengguna yang sesuai dengan pencarian.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Pengguna</th>
                    <th className="py-3 px-3">Provider</th>
                    <th className="py-3 px-3 text-center">Selesai / Dibuat</th>
                    <th className="py-3 px-3">Terdaftar</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-right">Aksi Administrator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{u.avatar || '🦊'}</span>
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {u.isBanned && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
                                  Diblokir
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.provider === 'google'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {u.provider === 'google' ? 'Google OAuth' : 'Email/Password'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="font-bold text-slate-700 dark:text-slate-300">
                          {u.totalSolved} / {u.puzzlesCount || u.totalCreated}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('id-ID') : '-'}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.isBanned
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {u.isBanned ? 'Nonaktif' : 'Aktif'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Reset Password Button (For Email users) */}
                          <button
                            type="button"
                            onClick={() => {
                              setResetPasswordUser(u);
                              setNewPasswordInput('');
                            }}
                            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600 transition-colors"
                            title="Reset Kata Sandi Pengguna"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {/* Toggle Ban Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleUserBan(u)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              u.isBanned
                                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                                : 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                            }`}
                            title={u.isBanned ? 'Buka Blokir Akun' : 'Blokir Akun Pengguna'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete User Button */}
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                type: 'user',
                                id: u.id,
                                title: `akun pengguna "${u.email || u.name}"`,
                              })
                            }
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            title="Hapus Pengguna Permanen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PUZZLE MODERATION */}
      {/* ===================================================================== */}
      {activeTab === 'puzzles' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Moderasi Teka-Teki Silang ({filteredPuzzles.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tandai sebagai Pilihan Editor ⭐, tinjau kualitas clue, atau hapus konten tidak pantas.
              </p>
            </div>

            {/* Filter & Search */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={puzzleSearch}
                  onChange={(e) => setPuzzleSearch(e.target.value)}
                  placeholder="Cari judul / pembuat..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={puzzleFilter}
                onChange={(e: any) => setPuzzleFilter(e.target.value)}
                className="py-1.5 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="all">Semua Teka-Teki</option>
                <option value="featured">Pilihan Editor ⭐</option>
                <option value="drafts">Draf Pengguna</option>
              </select>
            </div>
          </div>

          {filteredPuzzles.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              Tidak ada teka-teki silang yang ditemukan.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPuzzles.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    p.isFeatured
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/60 shadow-xs'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                          {p.title}
                        </span>
                        {p.isFeatured && (
                          <span className="text-amber-500" title="Pilihan Editor">
                            ⭐
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Oleh: <strong className="text-slate-700 dark:text-slate-300">{p.authorName}</strong>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {p.customCode || p.id.substring(0, 8)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/50 dark:border-slate-700/50 pt-2.5">
                    <span>Grid {p.width}x{p.height} ({p.clues?.length || 0} Soal)</span>
                    <div className="flex items-center gap-2">
                      <span>💬 {p.comments?.length || 0}</span>
                      <span>❤️ {(p.reactions?.love || 0) + (p.reactions?.like || 0)}</span>
                    </div>
                  </div>

                  {/* Puzzle Action Buttons */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleFeaturePuzzle(p)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        p.isFeatured
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-amber-100 hover:text-amber-800'
                      }`}
                    >
                      <Star className={`w-3 h-3 ${p.isFeatured ? 'fill-amber-500 text-amber-500' : ''}`} />
                      <span>{p.isFeatured ? 'Featured' : 'Jadikan Pilihan'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {onPlayPuzzle && (
                        <button
                          type="button"
                          onClick={() => onPlayPuzzle(p)}
                          className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                          title="Coba Mainkan / Tinjau"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingPuzzle(p)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                        title="Edit Info Teka-Teki"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeleteConfirm({
                            type: 'puzzle',
                            id: p.id,
                            title: `teka-teki silang "${p.title}"`,
                          })
                        }
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 hover:bg-rose-100 transition-colors"
                        title="Hapus Teka-Teki Permanen"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: COMMENTS MODERATION */}
      {/* ===================================================================== */}
      {activeTab === 'comments' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Moderasi Komentar Komunitas ({filteredComments.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tinjau dan bersihkan komentar spam atau kata-kata yang tidak pantas.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={commentSearch}
                onChange={(e) => setCommentSearch(e.target.value)}
                placeholder="Cari isi komentar / nama..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {filteredComments.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              Tidak ada komentar yang ditemukan.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredComments.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span>{c.authorAvatar || '🦊'}</span>
                      <strong className="text-slate-800 dark:text-slate-200">{c.authorName}</strong>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-400 text-[11px]">
                        pada TTS: <strong className="text-indigo-600 dark:text-indigo-400">{c.puzzleTitle}</strong>
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        ({new Date(c.createdAt).toLocaleString('id-ID')})
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 pl-6 leading-relaxed">
                      "{c.content}"
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteConfirm({
                        type: 'comment',
                        id: c.puzzleId,
                        secondaryId: c.id,
                        title: `komentar dari "${c.authorName}"`,
                      })
                    }
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors shrink-0"
                    title="Hapus Komentar Ini"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: LEADERBOARD MODERATION */}
      {/* ===================================================================== */}
      {activeTab === 'leaderboards' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                Moderasi Papan Skor Speedrun ({filteredLeaderboards.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hapus catatan skor tidak realistis / cheat speedrun yang merusak sportivitas leaderboard.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                placeholder="Cari pemain / teka-teki..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {filteredLeaderboards.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
              Belum ada catatan skor di leaderboard.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Pemain</th>
                    <th className="py-2.5 px-3">Teka-Teki</th>
                    <th className="py-2.5 px-3 text-center">Waktu Tempuh</th>
                    <th className="py-2.5 px-3 text-center">Skor Poin</th>
                    <th className="py-2.5 px-3">Diselesaikan Pada</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLeaderboards.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <span>{l.playerAvatar || '🦊'}</span>
                        <span>{l.playerName}</span>
                      </td>

                      <td className="py-2.5 px-3 text-indigo-600 dark:text-indigo-400 font-semibold line-clamp-1 max-w-[200px]">
                        {l.puzzleTitle}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        {Math.floor(l.timeMs / 60000)}m {Math.floor((l.timeMs % 60000) / 1000)}s
                      </td>

                      <td className="py-2.5 px-3 text-center font-bold text-amber-600">
                        {l.score || 1000}
                      </td>

                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {new Date(l.completedAt).toLocaleString('id-ID')}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteConfirm({
                              type: 'leaderboard',
                              id: l.puzzleId,
                              secondaryId: l.id,
                              title: `skor speedrun "${l.playerName}" pada "${l.puzzleTitle}"`,
                            })
                          }
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                          title="Hapus Catatan Skor Ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 6: GLOBAL ANNOUNCEMENT BANNER */}
      {/* ===================================================================== */}
      {activeTab === 'announcement' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-indigo-500" />
              <span>Pengumuman Global (Broadcast Banner)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pesan ini akan ditampilkan di bagian paling atas aplikasi untuk semua pengunjung & pemain Teka Teki Sharing.
            </p>
          </div>

          <div className="space-y-4">
            {/* Toggle Active Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Status Banner Pengumuman
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {announcement.isActive ? 'Banner aktif dan terlihat oleh semua pemain' : 'Banner disembunyikan / nonaktif'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setAnnouncement((p) => ({ ...p, isActive: !p.isActive }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  announcement.isActive ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    announcement.isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Type selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Tipe Warna Banner
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { type: 'info', label: 'Informasi (Indigo/Biru)', color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
                  { type: 'warning', label: 'Peringatan / Maintenance (Amber)', color: 'bg-amber-50 border-amber-200 text-amber-800' },
                  { type: 'success', label: 'Sukses / Event Turnamen (Emerald)', color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                ].map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setAnnouncement((p) => ({ ...p, type: item.type as any }))}
                    className={`p-2.5 rounded-xl text-xs font-bold border text-left transition-all cursor-pointer ${
                      announcement.type === item.type
                        ? 'border-indigo-600 ring-2 ring-indigo-500/20 ' + item.color
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Teks Pengumuman
              </label>
              <textarea
                rows={3}
                value={announcement.message}
                onChange={(e) => setAnnouncement((p) => ({ ...p, message: e.target.value }))}
                placeholder="Contoh: Selamat datang di Event TTS Speedrun Mingguan! Dapatkan skor tercepat untuk menempati peringkat teratas."
                className="w-full p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Live Preview Box */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                Pratinjau Tampilan Pemain:
              </label>
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
                  announcement.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                    : announcement.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                    : 'bg-indigo-500/10 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200'
                }`}
              >
                <Megaphone className="w-4 h-4 shrink-0" />
                <span className="flex-1">{announcement.message || '(Teks pengumuman kosong)'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveAnnouncement}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Pengumuman Global</span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB: GENERATOR TTS OTOMATIS (AI) */}
      {/* ===================================================================== */}
      {activeTab === 'ai-generator' && (
        <div className="space-y-4">
          {/* Panel Generate */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Generator TTS Otomatis</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                AI (Groq) akan membuat kata & soal sesuai topik, lalu disusun otomatis jadi grid TTS.
                Hasilnya tersimpan sebagai <b>draft</b> — belum terlihat pemain lain sampai Anda edit & publish sendiri.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Topik TTS
                </label>
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !isGeneratingAi) handleGenerateAiPuzzle(); }}
                  placeholder="Contoh: Kuliner Nusantara, Sejarah Indonesia, Film 90-an..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={isGeneratingAi}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Jumlah Kata
                </label>
                <select
                  value={aiWordCount}
                  onChange={(e) => setAiWordCount(Number(e.target.value))}
                  disabled={isGeneratingAi}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[8, 10, 12, 15, 18, 20].map((n) => (
                    <option key={n} value={n}>{n} kata</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateAiPuzzle}
              disabled={isGeneratingAi || !aiTopic.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingAi ? 'animate-pulse' : ''}`} />
              <span>{isGeneratingAi ? 'Sedang membuat TTS...' : 'Generate TTS Sekarang'}</span>
            </button>

            {aiGenerateResult && (
              <div className="text-xs font-semibold p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                {aiGenerateResult}
              </div>
            )}

            <div className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Butuh <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">GROQ_API_KEY</code> di
              Vercel Environment Variables. Model default: <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">openai/gpt-oss-120b</code> (bisa
              diganti lewat <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">GROQ_MODEL</code>).
            </div>
          </div>

          {/* Daftar Draft AI */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Draft Hasil Generate ({aiDrafts.length})
            </h3>
            {aiDrafts.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
                Belum ada draft. Generate TTS baru di atas untuk mulai.
              </div>
            ) : (
              <div className="space-y-2">
                {aiDrafts.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{d.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {d.width}x{d.height} kotak · {(d.clues || []).length} soal
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openAiDraftEditor(d)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 text-[11px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAiDraft(d)}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900 cursor-pointer"
                        title="Hapus draft"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: RESET PASSWORD PENGGUNA */}
      {/* ===================================================================== */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <KeyRound className="w-4 h-4" />
                <span>Reset Kata Sandi Pengguna</span>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Masukkan kata sandi baru untuk akun{' '}
              <strong className="text-slate-800 dark:text-slate-200">{resetPasswordUser.email}</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Kata Sandi Baru (Min. 6 Karakter)
              </label>
              <input
                type="text"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="Masukkan kata sandi baru..."
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetPasswordSubmit}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Simpan Password Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: EDIT PUZZLE METADATA */}
      {/* ===================================================================== */}
      {editingPuzzle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                <Edit className="w-4 h-4" />
                <span>Edit Teka-Teki Silang (Admin)</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingPuzzle(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Judul Teka-Teki</label>
                <input
                  type="text"
                  value={editingPuzzle.title}
                  onChange={(e) => setEditingPuzzle({ ...editingPuzzle, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Deskripsi / Kategori</label>
                <input
                  type="text"
                  value={editingPuzzle.description || ''}
                  onChange={(e) => setEditingPuzzle({ ...editingPuzzle, description: e.target.value })}
                  placeholder="Keterangan teka-teki..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tingkat Kesulitan</label>
                <select
                  value={editingPuzzle.difficulty || 'Sedang'}
                  onChange={(e: any) => setEditingPuzzle({ ...editingPuzzle, difficulty: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                >
                  <option value="Mudah">Mudah</option>
                  <option value="Sedang">Sedang</option>
                  <option value="Sulit">Sulit</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPuzzle(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePuzzleEdit}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: EDIT & PUBLISH DRAFT AI */}
      {/* ===================================================================== */}
      {editingAiDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>Edit Draft AI</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingAiDraft(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Judul TTS</label>
                <input
                  type="text"
                  value={aiDraftTitleInput}
                  onChange={(e) => setAiDraftTitleInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Deskripsi</label>
                <input
                  type="text"
                  value={aiDraftDescInput}
                  onChange={(e) => setAiDraftDescInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Penulis (ditampilkan saat dipublikasikan)
                </label>
                <input
                  type="text"
                  value={aiDraftAuthorInput}
                  onChange={(e) => setAiDraftAuthorInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Soal ({(editingAiDraft.clues || []).length})
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {(editingAiDraft.clues || [])
                    .slice()
                    .sort((a: any, b: any) => a.number - b.number || (a.direction > b.direction ? 1 : -1))
                    .map((c: any) => (
                      <div key={c.id} className="flex items-start gap-2">
                        <span className="mt-2 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                          {c.number}{c.direction === 'across' ? 'M' : 'K'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={aiDraftClueInputs[c.id] ?? c.question}
                            onChange={(e) =>
                              setAiDraftClueInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px]"
                          />
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Jawaban: {c.answer} ({c.length} huruf, {c.direction === 'across' ? 'Mendatar' : 'Menurun'})
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveAiDraft}
                disabled={isSavingAiDraft || isPublishingAiDraft}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isSavingAiDraft ? 'Menyimpan...' : 'Simpan Draft'}
              </button>
              <button
                type="button"
                onClick={handlePublishAiDraft}
                disabled={isSavingAiDraft || isPublishingAiDraft}
                className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {isPublishingAiDraft ? 'Mempublikasikan...' : '🚀 Publikasikan ke Komunitas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ===================================================================== */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Konfirmasi Hapus Permanen
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Apakah Anda yakin ingin menghapus {deleteConfirm.title}? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirm.type === 'user') {
                    handleDeleteUser(deleteConfirm.id);
                  } else if (deleteConfirm.type === 'puzzle') {
                    handleDeletePuzzle(deleteConfirm.id);
                  } else if (deleteConfirm.type === 'comment' && deleteConfirm.secondaryId) {
                    handleDeleteComment(deleteConfirm.id, deleteConfirm.secondaryId);
                  } else if (deleteConfirm.type === 'leaderboard' && deleteConfirm.secondaryId) {
                    handleDeleteLeaderboard(deleteConfirm.id, deleteConfirm.secondaryId);
                  }
                }}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: SUPABASE SQL SETUP SCRIPT */}
      {/* ===================================================================== */}
      {showSqlSchemaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Skrip SQL Inisialisasi & Perbaikan Supabase
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Jalankan skrip ini di Supabase Dashboard ➔ SQL Editor untuk membuat tabel dan kolom otomatis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlSchemaModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                <span className="font-bold">Langkah Cepat:</span> Buka{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold hover:text-amber-900 dark:hover:text-amber-100 inline-flex items-center gap-0.5"
                >
                  Supabase Dashboard <ExternalLink className="w-3 h-3 inline" />
                </a>{' '}
                ➔ Klik menu <strong>SQL Editor</strong> di kiri ➔ Klik <strong>New Query</strong> ➔ Tempel (Paste) skrip di bawah ini ➔ Klik tombol <strong>Run</strong>.
              </div>

              <div className="relative">
                <pre className="p-4 bg-slate-950 text-emerald-400 rounded-2xl text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800 select-all max-h-[350px]">
{`-- 1. TABEL PUZZLES
CREATE TABLE IF NOT EXISTS public.puzzles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Teka Teki Silang',
    author_name TEXT DEFAULT 'Pemain TTS',
    author_id TEXT,
    author_avatar TEXT DEFAULT '🦊',
    author_email TEXT,
    custom_code TEXT,
    width INTEGER DEFAULT 10,
    height INTEGER DEFAULT 10,
    grid JSONB DEFAULT '[]'::jsonb,
    clues JSONB DEFAULT '{"across":[],"down":[]}'::jsonb,
    reactions JSONB DEFAULT '{"like":0,"laugh":0,"love":0,"think":0,"fire":0,"sad":0}'::jsonb,
    user_reactions JSONB DEFAULT '{}'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,
    is_draft BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- 2. TABEL USER_ACCOUNTS
CREATE TABLE IF NOT EXISTS public.user_accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    photo_url TEXT,
    google_id TEXT,
    password_salt TEXT,
    password_hash TEXT,
    auth_token TEXT,
    sync_key TEXT,
    provider TEXT DEFAULT 'email',
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    puzzles JSONB DEFAULT '[]'::jsonb,
    drafts JSONB DEFAULT '[]'::jsonb,
    progress JSONB DEFAULT '{}'::jsonb,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    last_synced_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 3. TABEL LEADERBOARD (SPEEDRUN)
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id TEXT PRIMARY KEY,
    puzzle_id TEXT NOT NULL,
    player_name TEXT DEFAULT 'Pemain TTS',
    player_avatar TEXT DEFAULT '🦊',
    player_id TEXT,
    player_email TEXT,
    time_ms BIGINT DEFAULT 0,
    score INTEGER DEFAULT 1000,
    formatted_time TEXT,
    completed_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS time_ms BIGINT DEFAULT 0;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS formatted_time TEXT;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 1000;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 4. TABEL PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    sync_key TEXT,
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full puzzles" ON public.puzzles;
CREATE POLICY "Public full puzzles" ON public.puzzles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full leaderboard" ON public.leaderboard;
CREATE POLICY "Public full leaderboard" ON public.leaderboard FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full user_accounts" ON public.user_accounts;
CREATE POLICY "Public full user_accounts" ON public.user_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full profiles" ON public.profiles;
CREATE POLICY "Public full profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);`}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const sqlText = `-- 1. TABEL PUZZLES
CREATE TABLE IF NOT EXISTS public.puzzles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Teka Teki Silang',
    author_name TEXT DEFAULT 'Pemain TTS',
    author_id TEXT,
    author_avatar TEXT DEFAULT '🦊',
    author_email TEXT,
    custom_code TEXT,
    width INTEGER DEFAULT 10,
    height INTEGER DEFAULT 10,
    grid JSONB DEFAULT '[]'::jsonb,
    clues JSONB DEFAULT '{"across":[],"down":[]}'::jsonb,
    reactions JSONB DEFAULT '{"like":0,"laugh":0,"love":0,"think":0,"fire":0,"sad":0}'::jsonb,
    user_reactions JSONB DEFAULT '{}'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,
    is_draft BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- 2. TABEL USER_ACCOUNTS
CREATE TABLE IF NOT EXISTS public.user_accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    photo_url TEXT,
    google_id TEXT,
    password_salt TEXT,
    password_hash TEXT,
    auth_token TEXT,
    sync_key TEXT,
    provider TEXT DEFAULT 'email',
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    puzzles JSONB DEFAULT '[]'::jsonb,
    drafts JSONB DEFAULT '[]'::jsonb,
    progress JSONB DEFAULT '{}'::jsonb,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    last_synced_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 3. TABEL LEADERBOARD (SPEEDRUN)
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id TEXT PRIMARY KEY,
    puzzle_id TEXT NOT NULL,
    player_name TEXT DEFAULT 'Pemain TTS',
    player_avatar TEXT DEFAULT '🦊',
    player_id TEXT,
    player_email TEXT,
    time_ms BIGINT DEFAULT 0,
    score INTEGER DEFAULT 1000,
    formatted_time TEXT,
    completed_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS time_ms BIGINT DEFAULT 0;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS formatted_time TEXT;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 1000;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 4. TABEL PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    sync_key TEXT,
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public full puzzles" ON public.puzzles;
CREATE POLICY "Public full puzzles" ON public.puzzles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full leaderboard" ON public.leaderboard;
CREATE POLICY "Public full leaderboard" ON public.leaderboard FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full user_accounts" ON public.user_accounts;
CREATE POLICY "Public full user_accounts" ON public.user_accounts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public full profiles" ON public.profiles;
CREATE POLICY "Public full profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);`;
                  navigator.clipboard.writeText(sqlText);
                  setIsCopiedSql(true);
                  setTimeout(() => setIsCopiedSql(false), 3000);
                  showNotification('Skrip SQL berhasil disalin ke clipboard!', 'success');
                }}
                className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isCopiedSql ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedSql ? 'Tersalin!' : 'Salin Seluruh Skrip SQL'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Cloud Direct Configuration Modal */}
      {showSupabaseConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Konfigurasi Kunci Supabase Cloud
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Masukkan kredensial Supabase untuk mengaktifkan sinkronisasi database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSupabaseConfigModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupabaseConfig} className="p-5 space-y-4">
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Di mana menemukan Project URL & API Key?
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Buka dashboard Supabase Anda ➔ Pilih Proyek ➔ Masuk menu <strong>Project Settings</strong> (ikon gerigi) ➔ <strong>API</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Project URL (SUPABASE_URL)
                </label>
                <input
                  type="text"
                  placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
                  value={supabaseUrlInput}
                  onChange={(e) => setSupabaseUrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  API Key / Service Role Key (SUPABASE_SERVICE_ROLE_KEY)
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKeyInput}
                  onChange={(e) => setSupabaseKeyInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Gunakan <em>service_role secret key</em> (atau <em>anon public key</em>). Kunci ini akan disimpan aman di memory server backend.
                </p>
              </div>

              {/* Status Details if already connected */}
              {stats?.supabaseStatusDetails && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Status Terkoneksi:</span>
                    <span
                      className={`font-bold text-[11px] ${
                        stats.supabaseConnected ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {stats.supabaseConnected ? 'Terhubung ke Cloud' : 'Belum Terhubung'}
                    </span>
                  </div>
                  {stats.supabaseStatusDetails.error && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      {stats.supabaseStatusDetails.error}
                    </p>
                  )}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupabaseConfigModal(false)}
                  className="py-2 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupabase}
                  className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingSupabase ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isSavingSupabase ? 'Menyimpan & Menguji...' : 'Simpan & Uji Koneksi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
