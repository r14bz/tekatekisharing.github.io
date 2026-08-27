import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Play,
  Share2,
  Trash2,
  Edit,
  Clock,
  Trophy,
  Copy,
  Check,
  Search,
  Sparkles,
  Layers,
  FileText,
  Tag,
  Globe,
  User,
  ArrowRight,
  Send,
  HelpCircle,
  RefreshCw,
  Cloud,
  CloudCheck,
  MessageSquare,
  LogIn,
  Lock,
  ShieldCheck,
  Flame,
  Zap,
  Award,
  Compass,
  BookOpen,
} from 'lucide-react';
import { CrosswordPuzzle, PuzzleProgress, UserProfile } from '../types/tts';
import { StorageService } from '../services/storageService';
import { SyncService } from '../services/syncService';
import { CloudService } from '../services/cloudService';
import { formatTimeShort } from '../services/gridBuilder';
import { PuzzleInteractions } from './PuzzleInteractions';

interface CommunityViewProps {
  userProfile: UserProfile;
  onPlayPuzzle: (puzzle: CrosswordPuzzle) => void;
  onCreateNew: () => void;
  onEditPuzzle: (puzzle: CrosswordPuzzle) => void;
  onOpenShareModal: (puzzle: CrosswordPuzzle) => void;
  onOpenLeaderboardForPuzzle: (puzzle: CrosswordPuzzle) => void;
  initialTab?: 'community' | 'my' | 'drafts';
  onOpenSyncModal?: () => void;
}

// Color palette themes for cards to make them vibrant and visually distinct
const CARD_THEMES = [
  {
    accentGradient: 'from-indigo-500 via-purple-500 to-pink-500',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    hoverBorder: 'hover:border-indigo-400 dark:hover:border-indigo-500',
    tagBg: 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    tagIcon: 'text-indigo-500 dark:text-indigo-400',
    avatarRing: 'ring-indigo-300 dark:ring-indigo-700',
  },
  {
    accentGradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    hoverBorder: 'hover:border-emerald-400 dark:hover:border-emerald-500',
    tagBg: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    tagIcon: 'text-emerald-500 dark:text-emerald-400',
    avatarRing: 'ring-emerald-300 dark:ring-emerald-700',
  },
  {
    accentGradient: 'from-amber-500 via-orange-500 to-rose-500',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    hoverBorder: 'hover:border-amber-400 dark:hover:border-amber-500',
    tagBg: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    tagIcon: 'text-amber-500 dark:text-amber-400',
    avatarRing: 'ring-amber-300 dark:ring-amber-700',
  },
  {
    accentGradient: 'from-blue-500 via-cyan-500 to-teal-500',
    badgeBg: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    hoverBorder: 'hover:border-cyan-400 dark:hover:border-cyan-500',
    tagBg: 'bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/50 dark:hover:bg-cyan-900/50 text-cyan-800 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
    tagIcon: 'text-cyan-500 dark:text-cyan-400',
    avatarRing: 'ring-cyan-300 dark:ring-cyan-700',
  },
  {
    accentGradient: 'from-violet-500 via-fuchsia-500 to-pink-500',
    badgeBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800',
    hoverBorder: 'hover:border-fuchsia-400 dark:hover:border-fuchsia-500',
    tagBg: 'bg-fuchsia-50 hover:bg-fuchsia-100 dark:bg-fuchsia-950/50 dark:hover:bg-fuchsia-900/50 text-fuchsia-800 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800',
    tagIcon: 'text-fuchsia-500 dark:text-fuchsia-400',
    avatarRing: 'ring-fuchsia-300 dark:ring-fuchsia-700',
  },
];

const getCardTheme = (puzzle: CrosswordPuzzle, index: number) => {
  let hash = index;
  if (puzzle.id) {
    for (let i = 0; i < puzzle.id.length; i++) {
      hash += puzzle.id.charCodeAt(i);
    }
  }
  return CARD_THEMES[Math.abs(hash) % CARD_THEMES.length];
};

export const CommunityView: React.FC<CommunityViewProps> = ({
  userProfile,
  onPlayPuzzle,
  onCreateNew,
  onEditPuzzle,
  onOpenShareModal,
  onOpenLeaderboardForPuzzle,
  initialTab = 'community',
  onOpenSyncModal,
}) => {
  const [activeTab, setActiveTab] = useState<'community' | 'my' | 'drafts'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const [communityPuzzles, setCommunityPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [myPuzzles, setMyPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [draftPuzzles, setDraftPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, PuzzleProgress>>({});
  
  const [importCodeInput, setImportCodeInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const [puzzleToDelete, setPuzzleToDelete] = useState<{
    id: string;
    title: string;
    type: 'my' | 'draft';
  } | null>(null);
  const [isCloudLoading, setIsCloudLoading] = useState(false);

  const loadData = async (refreshCloud = false) => {
    // 1. Initial fast local load
    setCommunityPuzzles(StorageService.getCommunityPuzzles());
    setMyPuzzles(StorageService.getMyPuzzles());
    setDraftPuzzles(StorageService.getDraftPuzzles());
    setProgressMap(StorageService.getAllProgress());

    // 2. Fetch fresh community puzzles from shared Cloud Database
    try {
      if (refreshCloud) setIsCloudLoading(true);
      const cloudPuzzles = await CloudService.getCommunityPuzzles();
      if (cloudPuzzles) {
        setCommunityPuzzles(cloudPuzzles);
      }
    } catch (err) {
      console.warn('Error refreshing cloud puzzles:', err);
    } finally {
      setIsCloudLoading(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [userProfile.isLoggedIn, userProfile.id, userProfile.email]);

  const handleUpdatePuzzle = (updated: CrosswordPuzzle) => {
    setCommunityPuzzles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setMyPuzzles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleImportCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile.isLoggedIn) {
      if (onOpenSyncModal) onOpenSyncModal();
      return;
    }
    if (!importCodeInput.trim()) return;
    setImportError(null);

    const rawInput = importCodeInput.trim();

    // 1. Try finding in cloud database first by custom code or direct puzzle ID
    const foundInCloud = await CloudService.findPuzzleByCodeOrId(rawInput);
    if (foundInCloud) {
      StorageService.saveReceivedPuzzle(foundInCloud);
      await loadData();
      setImportCodeInput('');
      onPlayPuzzle(foundInCloud);
      return;
    }

    // 2. Try finding in local storage
    const foundByCode = StorageService.getPuzzleByCustomCode(rawInput);
    if (foundByCode) {
      StorageService.saveReceivedPuzzle(foundByCode);
      loadData();
      setImportCodeInput('');
      onPlayPuzzle(foundByCode);
      return;
    }

    // 3. Try decoding share link / base64 code
    let codeToDecode = rawInput;
    if (codeToDecode.includes('puzzle=')) {
      try {
        const url = new URL(codeToDecode);
        codeToDecode = url.searchParams.get('puzzle') || codeToDecode;
      } catch {
        // continue
      }
    }

    const decoded = SyncService.decodeShareCodeToPuzzle(codeToDecode);
    if (decoded) {
      StorageService.saveReceivedPuzzle(decoded);
      loadData();
      setImportCodeInput('');
      onPlayPuzzle(decoded);
    } else {
      setImportError(`Kode teka-teki "${rawInput}" tidak ditemukan di Cloud Database maupun lokal.`);
    }
  };

  const handleDeleteClick = (puzzle: CrosswordPuzzle, type: 'my' | 'draft') => {
    setPuzzleToDelete({
      id: puzzle.id,
      title: puzzle.title,
      type,
    });
  };

  const handleConfirmDelete = async () => {
    if (!puzzleToDelete) return;
    if (puzzleToDelete.type === 'my') {
      StorageService.deleteMyPuzzle(puzzleToDelete.id);
      await CloudService.deletePuzzle(puzzleToDelete.id);
    } else {
      StorageService.deleteDraftPuzzle(puzzleToDelete.id);
    }
    setPuzzleToDelete(null);
    loadData(true);
  };

  const handleCopyCustomCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2500);
  };

  // Determine current list and filtered list based on active tab & search query with useMemo
  const filteredList = useMemo(() => {
    let currentList: CrosswordPuzzle[] = [];
    if (activeTab === 'community') currentList = communityPuzzles;
    else if (activeTab === 'my') currentList = myPuzzles;
    else if (activeTab === 'drafts') currentList = draftPuzzles;

    if (!searchQuery.trim()) return currentList;

    const query = searchQuery.toLowerCase().trim();
    return currentList.filter((p) => {
      return (
        p.title.toLowerCase().includes(query) ||
        p.authorName.toLowerCase().includes(query) ||
        (p.customCode && p.customCode.toLowerCase().includes(query)) ||
        (p.description && p.description.toLowerCase().includes(query))
      );
    });
  }, [activeTab, communityPuzzles, myPuzzles, draftPuzzles, searchQuery]);

  return (
    <div id="community-view-container" className="w-full max-w-5xl mx-auto p-3 sm:p-6 pb-20">
      
      {/* 🌟 VIBRANT & ELEGANT HERO BANNER */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-purple-700 to-indigo-900 text-white shadow-xl mb-6 p-5 sm:p-7 border border-indigo-500/30">
        {/* Colorful ambient background light orbs */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-pink-500/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-amber-400/15 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Headline & Highlights */}
          <div className="max-w-xl">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-amber-200 text-[11px] font-black tracking-wide uppercase shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                Teka-Teki Silang Interaktif
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold">
                <Flame className="w-3 h-3 text-emerald-300" />
                Komunitas & Kreator
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight mb-2">
              Asah Otak & Bagikan Karya TTS Bersama
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed font-medium mb-4">
              Jelajahi teka-teki silang buatan komunitas, mainkan speedrun untuk meraih medali emas, atau buat TTS kreasimu sendiri dengan mudah!
            </p>

            {/* Micro feature pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-[11px] font-semibold text-indigo-100">
                <Globe className="w-3.5 h-3.5 text-cyan-300" />
                <span>{communityPuzzles.length}+ TTS Publik</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-[11px] font-semibold text-indigo-100">
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span>Peringkat Tercepat</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-[11px] font-semibold text-indigo-100">
                <MessageSquare className="w-3.5 h-3.5 text-pink-300" />
                <span>Reaksi & Komentar</span>
              </div>
            </div>
          </div>

          {/* Quick Create CTA Button */}
          <div className="shrink-0 flex flex-col sm:flex-row md:flex-col gap-2.5">
            <button
              type="button"
              id="btn-community-hero-create"
              onClick={() => {
                if (!userProfile.isLoggedIn) {
                  if (onOpenSyncModal) onOpenSyncModal();
                } else {
                  onCreateNew();
                }
              }}
              className="px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
              title={userProfile.isLoggedIn ? "Buat teka-teki silang baru" : "Login terlebih dahulu untuk membuat TTS baru"}
            >
              {userProfile.isLoggedIn ? (
                <Plus className="w-4 h-4 stroke-[3]" />
              ) : (
                <Lock className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>Buat TTS Baru Sekarang</span>
            </button>

            {!userProfile.isLoggedIn && onOpenSyncModal && (
              <button
                type="button"
                id="btn-community-hero-login"
                onClick={onOpenSyncModal}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-amber-200" />
                <span>Masuk Akun / Sinkronisasi</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 🏷️ INPUT KODE TEKA-TEKI FORM (Clean, Colorful & Focused) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm mb-6 transition-all hover:border-indigo-200 dark:hover:border-indigo-900">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                <span>Punya Kode Teka-Teki Silang?</span>
                {!userProfile.isLoggedIn && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Khusus Akun Terdaftar
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {userProfile.isLoggedIn
                  ? 'Ketik kode TTS unik dari teman untuk langsung membuka dan memainkannya'
                  : 'Masuk ke akun Anda untuk memasukkan kode TTS kustom dan memainkan teka-teki bersama teman'}
              </p>
            </div>
          </div>
        </div>

        {/* Code Form (accepts custom code or share code) */}
        {userProfile.isLoggedIn ? (
          <form onSubmit={handleImportCode} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Tag className="w-4 h-4 text-indigo-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="input-import-puzzle-code"
                value={importCodeInput}
                onChange={(e) => setImportCodeInput(e.target.value)}
                placeholder="Contoh kode: TTS-KUIS, SEJARAH-01, atau tempel tautan..."
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-950 font-mono font-semibold tracking-wide transition-all"
              />
            </div>
            <button
              type="submit"
              id="btn-submit-import-code"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow-indigo-500/20 active:scale-95 cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Buka & Mainkan</span>
            </button>
          </form>
        ) : (
          <div
            onClick={onOpenSyncModal}
            className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
          >
            <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-medium">
                Fitur memasukkan kode TTS hanya dapat digunakan oleh pengguna yang sudah <strong>Login</strong>.
              </span>
            </div>
            <button
              type="button"
              id="btn-login-to-import-code"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenSyncModal) onOpenSyncModal();
              }}
              className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login untuk Buka TTS</span>
            </button>
          </div>
        )}
        {importError && (
          <p className="text-rose-600 dark:text-rose-400 text-xs mt-2.5 font-medium bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-1.5 rounded-xl">
            {importError}
          </p>
        )}
      </div>

      {/* 🧭 MAIN TABS NAVIGATION (Komunitas, TTS Saya, Draf) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {/* Tab 1: Komunitas (Public Community) */}
          <button
            type="button"
            id="tab-community-puzzles"
            onClick={() => setActiveTab('community')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'community'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Komunitas</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'community'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {communityPuzzles.length}
            </span>
          </button>

          {/* Tab 2: TTS Saya (Requires Login/Registration) */}
          <button
            type="button"
            id="tab-my-puzzles"
            onClick={() => setActiveTab('my')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'my'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>TTS Saya</span>
            {userProfile.isLoggedIn ? (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'my'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                }`}
              >
                {myPuzzles.length}
              </span>
            ) : (
              <span className="text-[10px] p-1 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold" title="Hanya untuk Pengguna Terdaftar">
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
          </button>

          {/* Tab 3: Draf (Requires Login/Registration) */}
          <button
            type="button"
            id="tab-draft-puzzles"
            onClick={() => setActiveTab('drafts')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'drafts'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Draf</span>
            {userProfile.isLoggedIn ? (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'drafts'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}
              >
                {draftPuzzles.length}
              </span>
            ) : (
              <span className="text-[10px] p-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold" title="Hanya untuk Pengguna Terdaftar">
                <Lock className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        </div>

        {/* Search & Cloud Sync Refresh Bar */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, kreator, kode..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 font-medium"
            />
          </div>
          <button
            type="button"
            id="btn-refresh-cloud-community"
            onClick={() => loadData(true)}
            disabled={isCloudLoading}
            title="Muat Ulang dari Cloud Database"
            className="p-1.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCloudLoading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span className="hidden sm:inline text-[11px]">Sync</span>
          </button>
        </div>
      </div>

      {/* 🔒 REQUIREMENT: Tab "TTS Saya" dan "Draf" HANYA UNTUK PENGGUNA LOGIN / TERDAFTAR */}
      {!userProfile.isLoggedIn && (activeTab === 'my' || activeTab === 'drafts') ? (
        <div
          id="community-auth-gate-state"
          className="text-center py-12 px-6 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm relative overflow-hidden"
        >
          {/* Background Ambient Glow */}
          <div
            className={`absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none opacity-40 ${
              activeTab === 'my' ? 'bg-purple-400/30' : 'bg-amber-400/30'
            }`}
          />

          <div className="relative z-10 max-w-md mx-auto">
            {/* Gate Icon */}
            <div
              className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border shadow-sm ${
                activeTab === 'my'
                  ? 'bg-gradient-to-br from-purple-500 to-indigo-600 border-purple-400/40 text-white shadow-purple-500/20'
                  : 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400/40 text-white shadow-amber-500/20'
              }`}
            >
              {activeTab === 'my' ? (
                <div className="relative">
                  <User className="w-8 h-8" />
                  <Lock className="w-4 h-4 absolute -bottom-1 -right-1 text-amber-300 drop-shadow" />
                </div>
              ) : (
                <div className="relative">
                  <FileText className="w-8 h-8" />
                  <Lock className="w-4 h-4 absolute -bottom-1 -right-1 text-amber-300 drop-shadow" />
                </div>
              )}
            </div>

            {/* Title & Description */}
            <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">
              {activeTab === 'my' ? 'Akses Khusus Pembuat TTS Terdaftar' : 'Draf Teka-Teki Privat'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {activeTab === 'my'
                ? 'Tab "TTS Saya" khusus untuk pengguna yang sudah masuk/terdaftar. Masuk ke akun Anda untuk mengelola, mengedit, dan memantau teka-teki silang buatan Anda dengan aman.'
                : 'Tab "Draf" menyimpan rancangan teka-teki silang Anda secara aman di cloud. Masuk ke akun Anda untuk melanjutkan pengeditan rancangan kapan saja.'}
            </p>

            {/* Feature Benefits List */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xs border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 mb-6 text-left space-y-2 text-xs">
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Penyimpanan aman di cloud & sinkronisasi antar perangkat</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Hak kepemilikan karya terlindungi dari pengubahan orang lain</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Gratis pendaftaran tanpa biaya</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {onOpenSyncModal && (
                <button
                  type="button"
                  id="btn-login-from-tab-gate"
                  onClick={onOpenSyncModal}
                  className={`w-full sm:w-auto px-6 py-2.5 text-white text-xs sm:text-sm font-black rounded-xl inline-flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] active:scale-95 transition-all cursor-pointer ${
                    activeTab === 'my'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-purple-500/25'
                      : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/25'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Masuk / Daftar Akun</span>
                </button>
              )}
              <button
                type="button"
                id="btn-back-to-community-from-gate"
                onClick={() => setActiveTab('community')}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer"
              >
                Kembali ke Komunitas
              </button>
            </div>
          </div>
        </div>
      ) : filteredList.length === 0 ? (
        /* Empty State */
        <div
          id="community-empty-state"
          className="text-center py-14 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xs"
        >
          <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
            {activeTab === 'community'
              ? 'Tidak ada teka-teki yang cocok dengan pencarian'
              : activeTab === 'my'
              ? 'Belum Ada Teka-Teki Silang yang Dipublish'
              : activeTab === 'drafts'
              ? 'Belum Ada Draf Teka-Teki Tersimpan'
              : 'Belum Ada TTS Tersimpan'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
            {activeTab === 'drafts'
              ? 'Saat Anda membuat teka-teki di menu Buat TTS, klik "Simpan Draf" untuk melanjutkan rancangan Anda nanti.'
              : activeTab === 'my'
              ? 'Rancang teka-teki silang kreasi Anda sendiri dan publikasikan agar bisa dimainkan teman!'
              : 'Jelajahi teka-teki komunitas atau masukkan kode teka-teki teman Anda pada kolom di atas.'}
          </p>
          {(activeTab === 'my' || activeTab === 'drafts') && (
            <button
              type="button"
              id="btn-empty-create-first"
              onClick={onCreateNew}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Mulai Buat TTS
            </button>
          )}
        </div>
      ) : (
        /* 🎴 COLORFUL & ELEGANT PUZZLE CARDS GRID */
        <div className="w-full max-w-full min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((puzzle, index) => {
            const progress = progressMap[puzzle.id];
            const isCompleted = progress?.isCompleted;
            const hasProgress = progress && progress.userGrid && !isCompleted;
            const displayCode = puzzle.customCode || puzzle.id;
            const isCopied = copiedCodeId === puzzle.id;
            const isOwner = Boolean(
              userProfile.isLoggedIn &&
              (puzzle.authorId === userProfile.id ||
                (userProfile.email && puzzle.authorEmail === userProfile.email))
            );
            const theme = getCardTheme(puzzle, index);

            return (
              <div
                key={puzzle.id}
                id={`puzzle-card-${puzzle.id}`}
                className={`w-full max-w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${theme.hoverBorder} rounded-3xl p-4 sm:p-5 shadow-sm hover:shadow-md flex flex-col justify-between transition-all group overflow-hidden relative`}
              >
                {/* Top Colored Accent Stripe */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${theme.accentGradient}`}
                />

                <div className="pt-1">
                  {/* Card Header: Title, Creator & Size Badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 dark:text-white text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                        {puzzle.title}
                      </h3>
                      {puzzle.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 font-medium">
                          {puzzle.description}
                        </p>
                      )}
                    </div>
                    {/* Size Badge */}
                    <span
                      className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border shrink-0 ${theme.badgeBg}`}
                    >
                      {puzzle.width}x{puzzle.height} Kotak
                    </span>
                  </div>

                  {/* Creator Info & Clues count */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3 leading-normal">
                    <span className={`w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs ring-1 ${theme.avatarRing} shrink-0`}>
                      {puzzle.authorAvatar || '🦊'}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[120px] sm:max-w-[150px]">
                      {puzzle.authorName}
                    </span>
                    <span>•</span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {puzzle.clues.length} Soal ({puzzle.clues.filter((c) => c.direction === 'across').length}M, {puzzle.clues.filter((c) => c.direction === 'down').length}D)
                    </span>
                  </div>

                  {/* Code Tag & Status Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {/* Custom Code Pill */}
                    {displayCode && (
                      <button
                        type="button"
                        id={`btn-copy-card-code-${puzzle.id}`}
                        onClick={() => handleCopyCustomCode(displayCode, puzzle.id)}
                        className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 transition-colors cursor-pointer ${theme.tagBg}`}
                        title="Klik untuk salin kode teka-teki"
                      >
                        <Tag className={`w-3 h-3 ${theme.tagIcon}`} />
                        <span>{displayCode}</span>
                        {isCopied ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-bold ml-0.5">Tersalin!</span>
                        ) : (
                          <Copy className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                        )}
                      </button>
                    )}

                    {/* Progress / Status */}
                    {activeTab === 'drafts' ? (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Draf
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Selesai ({formatTimeShort(progress.timeSpentMs)})
                      </span>
                    ) : hasProgress ? (
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Berjalan ({formatTimeShort(progress.timeSpentMs)})
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800">
                        Siap Main
                      </span>
                    )}
                  </div>

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-between gap-2 pt-1 pb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Share Button (only for published puzzles) */}
                      {activeTab !== 'drafts' && (
                        <button
                          type="button"
                          id={`btn-card-share-${puzzle.id}`}
                          onClick={() => onOpenShareModal(puzzle)}
                          className="p-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 transition-colors cursor-pointer shadow-2xs"
                          title="Bagikan Kode Teka-Teki"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Leaderboard Button */}
                      {activeTab !== 'drafts' && (
                        <button
                          type="button"
                          id={`btn-card-leaderboard-${puzzle.id}`}
                          onClick={() => onOpenLeaderboardForPuzzle(puzzle)}
                          className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer shadow-2xs"
                          title="Lihat Papan Peringkat Tercepat"
                        >
                          <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </button>
                      )}

                      {/* Creator / Draft Edit and Delete actions (Strict Ownership Protected) */}
                      {activeTab === 'drafts' ? (
                        <>
                          <button
                            type="button"
                            id={`btn-draft-edit-${puzzle.id}`}
                            onClick={() => onEditPuzzle(puzzle)}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                            title="Lanjutkan Edit Draf"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Lanjut Edit</span>
                          </button>
                          <button
                            type="button"
                            id={`btn-draft-delete-${puzzle.id}`}
                            onClick={() => handleDeleteClick(puzzle, 'draft')}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Hapus Draf"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : isOwner ? (
                        <>
                          <button
                            type="button"
                            id={`btn-card-edit-${puzzle.id}`}
                            onClick={() => onEditPuzzle(puzzle)}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            title="Edit TTS Buatan Saya"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            id={`btn-card-delete-${puzzle.id}`}
                            onClick={() => handleDeleteClick(puzzle, 'my')}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Hapus TTS Buatan Saya"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : null}
                    </div>

                    {/* Play / Action Button */}
                    {activeTab !== 'drafts' ? (
                      <button
                        type="button"
                        id={`btn-card-play-${puzzle.id}`}
                        onClick={() => onPlayPuzzle(puzzle)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm hover:shadow-indigo-500/25 cursor-pointer shrink-0"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{hasProgress ? 'Lanjutkan' : isCompleted ? 'Main Ulang' : 'Mainkan'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        id={`btn-draft-publish-action-${puzzle.id}`}
                        onClick={() => onEditPuzzle(puzzle)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Publish Draf</span>
                      </button>
                    )}
                  </div>

                  {/* Interactive Reactions and Comments */}
                  {activeTab !== 'drafts' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <PuzzleInteractions
                        puzzle={puzzle}
                        userProfile={userProfile}
                        onUpdatePuzzle={handleUpdatePuzzle}
                        onOpenSyncModal={onOpenSyncModal}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {puzzleToDelete && (
        <div
          id="modal-delete-confirm-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            id="modal-delete-confirm-card"
            className="w-full max-w-xs sm:max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3.5">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mb-1.5">
              Hapus Teka-Teki Silang?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              Teka-teki silang <strong className="text-slate-700 dark:text-slate-200">"{puzzleToDelete.title}"</strong> akan dihapus secara permanen.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btn-cancel-delete"
                onClick={() => setPuzzleToDelete(null)}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                id="btn-confirm-delete"
                onClick={handleConfirmDelete}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
