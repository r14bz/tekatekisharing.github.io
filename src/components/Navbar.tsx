import React from 'react';
import {
  Grid,
  Trophy,
  Moon,
  Sun,
  Sparkles,
} from 'lucide-react';
import { UserProfile } from '../types/tts';

export type ActiveNavTab = 'play' | 'create' | 'library' | 'leaderboard' | 'admin';

interface NavbarProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  userProfile: UserProfile;
  onOpenSyncModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  userProfile,
  onOpenSyncModal,
  theme,
  onToggleTheme,
}) => {
  return (
    <header
      id="main-navbar"
      className="sticky top-0 z-40 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors"
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
        {/* Brand Logo */}
        <div
          id="navbar-brand-logo"
          onClick={() => onTabChange('library')}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
          title="Beranda Teka Teki Sharing"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-all">
            <span className="font-black font-mono text-sm tracking-tight">TTS</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-black tracking-tight text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1">
              Teka Teki Sharing
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              Komunitas & Speedrun
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            id="nav-tab-library"
            onClick={() => onTabChange('library')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'library' || activeTab === 'play'
                ? 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shadow-2xs font-black'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Beranda</span>
          </button>

          <button
            type="button"
            id="nav-tab-leaderboard"
            onClick={() => onTabChange('leaderboard')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs font-black'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            <span>Peringkat</span>
          </button>

         

          {/* Account & Cloud Sync Button */}
          <button
            type="button"
            id="btn-navbar-account-sync"
            onClick={onOpenSyncModal}
            className={`ml-0.5 sm:ml-1 flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 rounded-full border shadow-2xs transition-all cursor-pointer ${
              userProfile.isLoggedIn
                ? 'bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold'
                : 'bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/60 dark:to-purple-950/60 hover:from-indigo-100 hover:to-purple-100 dark:hover:from-indigo-900/60 dark:hover:to-purple-900/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold'
            }`}
            title={userProfile.isLoggedIn ? `Akun: ${userProfile.name} (Klik untuk kelola / Logout)` : 'Login Akun Cloud'}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                userProfile.isLoggedIn ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-400'
              }`}
            />
            <span className="text-xs">{userProfile.avatar || '🦊'}</span>
            <span className="text-[11px] font-bold max-w-[70px] sm:max-w-[120px] truncate">
              {userProfile.isLoggedIn ? 'Profile' : 'Login'}
            </span>
          </button>

          {/* Dark Mode Toggle Button */}
          <button
            type="button"
            id="btn-toggle-dark-mode"
            onClick={onToggleTheme}
            className="ml-0.5 p-2 rounded-xl text-slate-600 dark:text-amber-400 hover:text-slate-900 dark:hover:text-amber-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
            title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap (Malam)'}
            aria-label="Ubah Tema Gelap atau Terang"
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-600" />
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};
