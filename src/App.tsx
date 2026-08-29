import React, { useState, useEffect } from 'react';
import { CrosswordPuzzle, UserProfile, GlobalAnnouncement } from './types/tts';
import { StorageService } from './services/storageService';
import { SyncService } from './services/syncService';
import { CloudService } from './services/cloudService';
import { AdminService } from './services/adminService';
import { Navbar, ActiveNavTab } from './components/Navbar';
import { PlayerView } from './components/PlayerView';
import { CreatorView } from './components/CreatorView';
import { CommunityView } from './components/CommunityView';
import { CreatorProfileView } from './components/CreatorProfileView';
import { LeaderboardView } from './components/LeaderboardView';
import { AdminView } from './components/AdminView';
import { ShareModal } from './components/ShareModal';
import { AccountSyncModal } from './components/AccountSyncModal';
import { FooterStats } from './components/FooterStats';
import { startRealtime } from './services/realtimeService';
import { Megaphone, X } from 'lucide-react';

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    StorageService.getUserProfile()
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => StorageService.getTheme());
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('library');
  const [communityInitialTab, setCommunityInitialTab] = useState<'community' | 'my' | 'drafts'>('community');
  const [currentPlayingPuzzle, setCurrentPlayingPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [editingPuzzle, setEditingPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const [dismissedAnnouncement, setDismissedAnnouncement] = useState<boolean>(false);
  const [viewingCreator, setViewingCreator] = useState<{
    id?: string;
    name: string;
    avatar?: string;
    email?: string;
  } | null>(null);

  // Fetch active announcement banner
  useEffect(() => {
    AdminService.getPublicAnnouncement().then((ann) => {
      if (ann && ann.isActive && ann.message) {
        setAnnouncement(ann);
      }
    });
  }, []);


  // Public creator profile via URL: #creator/<authorId|name>
  useEffect(() => {
    const parseCreatorHash = () => {
      const hash = (window.location.hash || '').replace(/^#/, '');
      if (!hash.startsWith('creator/')) return;
      const key = decodeURIComponent(hash.slice('creator/'.length)).trim();
      if (!key) return;
      // Prefer id-like keys; name used as fallback label
      const looksLikeId = key.startsWith('u_') || key.length > 20 || key.includes('-');
      setViewingCreator({
        id: looksLikeId ? key : undefined,
        name: looksLikeId ? 'Kreator' : key,
      });
    };
    parseCreatorHash();
    window.addEventListener('hashchange', parseCreatorHash);
    return () => window.removeEventListener('hashchange', parseCreatorHash);
  }, []);

  // Supabase Realtime: invalidasi cache + minta UI refetch saat data berubah
  useEffect(() => {
    const stop = startRealtime({
      onPuzzleChange: () => {
        window.dispatchEvent(new CustomEvent('tts-realtime', { detail: { type: 'puzzles' } }));
      },
      onLeaderboardChange: () => {
        window.dispatchEvent(new CustomEvent('tts-realtime', { detail: { type: 'leaderboard' } }));
      },
    });
    return stop;
  }, []);


  // Sync light/dark theme to DOM and storage
  useEffect(() => {
    StorageService.setTheme(theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  // Apply saved color accent (footer palette) on first load
  useEffect(() => {
    const accent = StorageService.getColorAccent();
    document.documentElement.setAttribute('data-accent', accent);
  }, []);

  /**
   * Admin panel is NOT linked in the public UI.
   * Open only via secret URL (bookmark this privately):
   *   https://your-domain/#tts-admin
   *   https://your-domain/?tts_admin=1
   */
  const openAdminFromSecretUrl = () => {
    setActiveTab('admin');
  };

  const clearAdminSecretFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has('tts_admin')) {
        url.searchParams.delete('tts_admin');
        changed = true;
      }
      const hash = url.hash.replace(/^#/, '').toLowerCase();
      if (hash === 'tts-admin' || hash === 'tts-admin/') {
        url.hash = '';
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    } catch {
      // ignore
    }
  };

  const isAdminSecretUrl = (): boolean => {
    try {
      const hash = window.location.hash.replace(/^#/, '').toLowerCase();
      if (hash === 'tts-admin' || hash === 'tts-admin/') return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('tts_admin') === '1') return true;
    } catch {
      // ignore
    }
    return false;
  };

  // Open admin when secret hash/query is present (load + hashchange)
  useEffect(() => {
    const check = () => {
      if (isAdminSecretUrl()) {
        openAdminFromSecretUrl();
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Modals state
  const [shareModalPuzzle, setShareModalPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);

  // On initial mount: shared puzzle / restore — play only if logged in
  useEffect(() => {
    const sharedPuzzle = SyncService.checkUrlForSharedPuzzle();
    if (sharedPuzzle) {
      if (StorageService.getUserProfile().isLoggedIn) {
        setCurrentPlayingPuzzle(sharedPuzzle);
        setActiveTab('play');
      } else {
        // Simpan sementara & minta login dulu
        StorageService.saveReceivedPuzzle(sharedPuzzle);
        StorageService.setActivePuzzleId(sharedPuzzle.id);
        setIsSyncModalOpen(true);
      }
      return;
    }
    const activeId = StorageService.getActivePuzzleId();
    if (activeId && StorageService.getUserProfile().isLoggedIn) {
      const p = StorageService.getPuzzleById(activeId);
      if (p) setCurrentPlayingPuzzle(p);
    }
  }, []);

  const handlePlayPuzzle = (puzzle: CrosswordPuzzle) => {
    // Hanya user terdaftar yang boleh mengisi / memainkan TTS
    if (!userProfile.isLoggedIn) {
      setIsSyncModalOpen(true);
      return;
    }
    // Tutup profil kreator agar PlayerView bisa tampil (!viewingCreator)
    if (viewingCreator) {
      setViewingCreator(null);
      try {
        if ((window.location.hash || '').startsWith('#creator/')) {
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
      } catch { /* ignore */ }
    }
    setCurrentPlayingPuzzle(puzzle);
    StorageService.setActivePuzzleId(puzzle.id);
    setActiveTab('play');
    // Catat hitungan main ke server/Supabase (sekali per sesi per puzzle)
    void CloudService.recordPuzzlePlay(puzzle.id);
  };

  const handleCreateNew = () => {
    if (!userProfile.isLoggedIn) {
      setIsSyncModalOpen(true);
      return;
    }
    setEditingPuzzle(null);
    setActiveTab('create');
  };

  const handleEditPuzzle = (puzzle: CrosswordPuzzle) => {
    if (!userProfile.isLoggedIn) {
      setIsSyncModalOpen(true);
      return;
    }
    setEditingPuzzle(puzzle);
    setActiveTab('create');
  };

  const handleSaveAndPlay = (puzzle: CrosswordPuzzle) => {
    setViewingCreator(null);
    setCurrentPlayingPuzzle(puzzle);
    StorageService.setActivePuzzleId(puzzle.id);
    setActiveTab('play');
    void CloudService.recordPuzzlePlay(puzzle.id);
  };

  const handleOpenShareModal = (puzzle: CrosswordPuzzle) => {
    setShareModalPuzzle(puzzle);
  };

  const handleOpenLeaderboardForPuzzle = (puzzle: CrosswordPuzzle) => {
    setCurrentPlayingPuzzle(puzzle);
    setActiveTab('leaderboard');
  };

  const handleOpenDrafts = () => {
    setCommunityInitialTab('drafts');
    setActiveTab('library');
  };

  return (
    <div className="min-h-screen pb-[env(safe-area-inset-bottom)] bg-[#F3F4F6] dark:bg-[#0f172a] text-[#1F2937] dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'play' && !currentPlayingPuzzle) {
            setActiveTab('library');
          } else {
            setActiveTab(tab);
          }
        }}
        userProfile={userProfile}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Global Announcement Banner (Broadcast by Admin) */}
      {announcement && announcement.isActive && !dismissedAnnouncement && (
        <div
          className={`w-full py-2 px-4 text-xs font-semibold flex items-center justify-between gap-3 border-b shadow-2xs transition-all ${
            announcement.type === 'warning'
              ? 'bg-amber-500 text-slate-950 border-amber-600'
              : announcement.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-indigo-600 text-white border-indigo-700'
          }`}
        >
          <div className="max-w-6xl mx-auto w-full flex items-center justify-center gap-2 text-center">
            <Megaphone className="w-3.5 h-3.5 shrink-0 animate-bounce" />
            <span className="leading-snug">{announcement.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedAnnouncement(true)}
            className="p-1 hover:bg-black/10 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Tutup Pengumuman"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto flex flex-col">
        {!viewingCreator && activeTab === 'admin' && (
          <AdminView
            onBackToApp={() => {
              clearAdminSecretFromUrl();
              setActiveTab('library');
            }}
            onPlayPuzzle={handlePlayPuzzle}
            userProfile={userProfile}
          />
        )}

        {!viewingCreator && activeTab === 'play' && currentPlayingPuzzle && (
          <PlayerView
            puzzle={currentPlayingPuzzle}
            userProfile={userProfile}
            onBack={() => setActiveTab('library')}
            onOpenShareModal={handleOpenShareModal}
            onOpenLeaderboard={(p) => {
              setCurrentPlayingPuzzle(p);
              setActiveTab('leaderboard');
            }}
          />
        )}

        {!viewingCreator && activeTab === 'create' && (
          <CreatorView
            userProfile={userProfile}
            initialPuzzle={editingPuzzle}
            onSaveAndPlay={handleSaveAndPlay}
            onOpenShareModal={handleOpenShareModal}
            onOpenDrafts={handleOpenDrafts}
            onBackToHome={() => setActiveTab('library')}
          />
        )}

        {!viewingCreator && activeTab === 'library' && (
          <CommunityView
            key={`community-view-${communityInitialTab}`}
            userProfile={userProfile}
            initialTab={communityInitialTab}
            onPlayPuzzle={handlePlayPuzzle}
            onCreateNew={handleCreateNew}
            onEditPuzzle={handleEditPuzzle}
            onOpenShareModal={handleOpenShareModal}
            onOpenLeaderboardForPuzzle={handleOpenLeaderboardForPuzzle}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenCreatorProfile={(c) => setViewingCreator(c)}
          />
        )}

        {!viewingCreator && activeTab === 'leaderboard' && (
          <LeaderboardView
            currentPuzzle={currentPlayingPuzzle}
            onPlayPuzzle={handlePlayPuzzle}
          />
        )}
      </main>

      {/* Footer Statistik Pengguna di Bagian Paling Bawah */}
      {viewingCreator && (
        <main className="flex-1 w-full">
          <CreatorProfileView
            creator={viewingCreator}
            userProfile={userProfile}
            onBack={() => {
              setViewingCreator(null);
              try {
                if ((window.location.hash || '').startsWith('#creator/')) {
                  window.history.replaceState({}, '', window.location.pathname + window.location.search);
                }
              } catch { /* ignore */ }
            }}
            onPlayPuzzle={handlePlayPuzzle}
            onSharePuzzle={(p) => setShareModalPuzzle(p)}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
          />
        </main>
      )}

      <FooterStats />

      {/* Share Modal */}
      {shareModalPuzzle && (
        <ShareModal
          isOpen={true}
          puzzle={shareModalPuzzle}
          onClose={() => setShareModalPuzzle(null)}
        />
      )}

      {/* Account Sync & Cloud Modal */}
      <AccountSyncModal
        isOpen={isSyncModalOpen}
        userProfile={userProfile}
        onClose={() => setIsSyncModalOpen(false)}
        onProfileUpdated={(updated) => setUserProfile(updated)}
        onNavigateTab={(targetTab) => {
          if (targetTab === 'leaderboard') {
            setActiveTab('leaderboard');
          } else {
            setCommunityInitialTab(targetTab);
            setActiveTab('library');
          }
        }}
      />
    </div>
  );
}
