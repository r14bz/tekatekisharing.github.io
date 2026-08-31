import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  RefreshCw,
  User,
  ShieldCheck,
  Check,
  X,
  Mail,
  Lock,
  LogOut,
  AlertCircle,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  AlertTriangle,
  ArrowRight,
  KeyRound,
  Copy,
} from 'lucide-react';
import { UserProfile } from '../types/tts';
import { StorageService } from '../services/storageService';
import { SyncService } from '../services/syncService';

interface AccountSyncModalProps {
  isOpen: boolean;
  userProfile: UserProfile;
  onClose: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onNavigateTab?: (tab: 'community' | 'my' | 'drafts' | 'leaderboard') => void;
}

const AVATAR_LIST = ['🦊', '🐯', '🐼', '🦁', '🦉', '🐱', '🐶', '🚀', '⭐', '🧩', '🎯', '👑', '🌸', '⚡', '🏆', '💎'];

export const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  isOpen,
  userProfile,
  onClose,
  onProfileUpdated,
  onNavigateTab,
}) => {
  const [name, setName] = useState(userProfile.name);
  const [selectedAvatar, setSelectedAvatar] = useState(userProfile.avatar);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExistingEmailError, setIsExistingEmailError] = useState(false);

  // Dedicated Wrong Password Error Popup Modal
  const [showPasswordErrorPopup, setShowPasswordErrorPopup] = useState(false);
  const [passwordErrorDetail, setPasswordErrorDetail] = useState<string>('');

  // Auth Form State (When Not Logged In)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [regNameInput, setRegNameInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sub Tab (When Logged In)
  const [activeSubTab, setActiveSubTab] = useState<'cloud' | 'profile'>('cloud');
  const [copiedKey, setCopiedKey] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const myPuzzlesCount = StorageService.getMyPuzzles().length;
  const draftPuzzlesCount = StorageService.getDraftPuzzles().length;
  const solvedPuzzlesCount = StorageService.getSolvedPuzzlesCount();

  useEffect(() => {
    if (isOpen) {
      setName(userProfile.name);
      setSelectedAvatar(userProfile.avatar);
      setErrorMessage(null);
      setSyncStatus(null);
      setIsExistingEmailError(false);
      setShowPasswordErrorPopup(false);
      if (userProfile.email) {
        setEmailInput(userProfile.email);
      }
    }
  }, [isOpen, userProfile]);

  if (!isOpen) return null;

  // Handle Email & Password Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !passwordInput) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    if (passwordInput.length < 6) {
      setErrorMessage('Kata sandi yang diizinkan minimal 6 karakter.');
      return;
    }

    setIsSyncing(true);
    setErrorMessage(null);
    setSyncStatus(null);
    setShowPasswordErrorPopup(false);

    try {
      const res = await SyncService.loginWithEmail({
        email: cleanEmail,
        password: passwordInput,
      });

      if (res.success && res.profile) {
        onProfileUpdated(res.profile);
        setSyncStatus(res.message || 'Berhasil masuk ke akun cloud!');
        setPasswordInput('');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        if (res.errorType === 'wrong_password') {
          setPasswordErrorDetail(res.message || 'Kata sandi yang Anda masukkan salah. Pastikan huruf besar/kecil dan kombinasi kata sandi sesuai.');
          setShowPasswordErrorPopup(true);
        } else {
          setErrorMessage(res.message || 'Email atau kata sandi tidak sesuai.');
        }
      }
    } catch {
      setErrorMessage('Gagal menghubungi server cloud. Periksa koneksi internet Anda.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Email & Password Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !passwordInput) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    if (passwordInput.length < 6) {
      setErrorMessage('Kata sandi yang diizinkan minimal 6 karakter.');
      return;
    }

    setIsSyncing(true);
    setErrorMessage(null);
    setSyncStatus(null);
    setIsExistingEmailError(false);

    try {
      const res = await SyncService.registerWithEmail({
        email: cleanEmail,
        password: passwordInput,
        name: regNameInput.trim() || name.trim(),
        avatar: selectedAvatar,
      });

      if (res.success && res.profile) {
        onProfileUpdated(res.profile);
        setSyncStatus(res.message || 'Akun berhasil dibuat dan dilindungi kata sandi!');
        setPasswordInput('');
        setTimeout(() => {
          onClose();
        }, 1400);
      } else {
        if (res.isExistingEmail) {
          setIsExistingEmailError(true);
          setErrorMessage(res.message || 'Email ini sudah terdaftar. Silakan masuk menggunakan kata sandi Anda.');
        } else {
          setErrorMessage(res.message || 'Gagal mendaftarkan akun.');
        }
      }
    } catch {
      setErrorMessage('Gagal menghubungi server cloud. Periksa koneksi internet Anda.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Logout from Cloud Account
  const handleLogout = () => {
    const guest = SyncService.logoutCloudAccount();
    onProfileUpdated(guest);
    setSyncStatus('Anda telah keluar dari akun. Mengalihkan ke halaman awal...');
    setErrorMessage(null);
    if (onNavigateTab) {
      onNavigateTab('community');
    }
    setTimeout(() => {
      onClose();
    }, 600);
  };

  // Immediate Cloud Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    setSyncStatus(null);
    try {
      const result = await SyncService.syncToCloud(userProfile);
      if (result.success) {
        setSyncStatus(result.message);
        // Hanya update lastSyncedAt kalau sync BENAR-BENAR berhasil —
        // sebelumnya ini selalu dijalankan meski result.success === false,
        // sehingga UI bisa menampilkan "tersinkron baru saja" padahal
        // sinkronisasi sebenarnya gagal.
        onProfileUpdated({ ...userProfile, lastSyncedAt: Date.now() });
      } else {
        setErrorMessage(result.message);
      }
    } catch {
      setErrorMessage('Sinkronisasi cloud gagal. Periksa koneksi internet Anda.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Local Profile Details (Only accessible when logged in)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const updated: UserProfile = {
      ...userProfile,
      name: name.trim(),
      avatar: selectedAvatar,
    };
    StorageService.saveUserProfile(updated);
    onProfileUpdated(updated);
    setSyncStatus('Menyimpan profil ke cloud…');
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(updated),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.success) {
        setSyncStatus('Profil & avatar tersinkron ke cloud (terlihat pemain lain)!');
      } else {
        StorageService.triggerBackgroundAutoSync();
        setSyncStatus('Profil lokal disimpan. Sinkron cloud tertunda.');
      }
    } catch {
      StorageService.triggerBackgroundAutoSync();
      setSyncStatus('Profil lokal disimpan. Periksa koneksi untuk sync cloud.');
    }
    setTimeout(() => setSyncStatus(null), 3500);
  };

  const handleCopySyncKey = () => {
    navigator.clipboard.writeText(userProfile.syncKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div
      id="account-sync-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    >
      <div
        id="account-sync-modal-content"
        className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl relative custom-scrollbar transition-colors"
      >
        {/* Close Button */}
        <button
          type="button"
          id="btn-close-sync-modal"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Tutup Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-900 shadow-2xs">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <span>{userProfile.isLoggedIn ? 'Akun Cloud & Profil' : 'Akun Teka-Teki Silang'}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {userProfile.isLoggedIn
                ? 'Kelola data dan sinkronisasi otomatis teka-teki silang Anda'
                : 'Masuk atau daftar untuk menyimpan skor & TTS di cloud'}
            </p>
          </div>
        </div>

        {/* Status Alert Banner */}
        {syncStatus && (
          <div
            id="sync-status-alert"
            className="mb-4 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in"
          >
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{syncStatus}</span>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && !showPasswordErrorPopup && (
          <div
            id="sync-error-alert"
            className="mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex flex-col gap-2 animate-in fade-in"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{errorMessage}</span>
            </div>

            {/* If Email already exists, offer 1-click switch to Login Tab */}
            {isExistingEmailError && (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMessage(null);
                  setIsExistingEmailError(false);
                }}
                className="mt-1 self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <span>Pindah ke Tab Masuk (Login)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Pop-up Dialog: Wrong Password Error */}
        {showPasswordErrorPopup && (
          <div
            id="wrong-password-popup-card"
            className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border-2 border-rose-400 dark:border-rose-700 text-rose-900 dark:text-rose-200 shadow-md animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-200 dark:bg-rose-900/80 rounded-xl text-rose-700 dark:text-rose-300 shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                  <span>Kata Sandi Salah!</span>
                </h4>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 leading-relaxed font-medium">
                  {passwordErrorDetail || 'Kata sandi yang Anda masukkan salah. Pastikan huruf besar/kecil dan kombinasi kata sandi sesuai.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordErrorPopup(false);
                      setTimeout(() => {
                        passwordInputRef.current?.focus();
                      }, 100);
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <span>Coba Masukkan Kata Sandi Lagi</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCENARIO A: USER IS NOT LOGGED IN -> ONLY SHOW LOGIN AND REGISTER TABS     */}
        {/* ========================================================================= */}
        {!userProfile.isLoggedIn ? (
          <div className="space-y-4">
            {/* Tabs: Masuk (Login) vs Daftar */}
            <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1.5 shadow-2xs">
              <button
                type="button"
                id="tab-auth-login"
                onClick={() => {
                  setAuthMode('login');
                  setErrorMessage(null);
                  setIsExistingEmailError(false);
                  setShowPasswordErrorPopup(false);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Masuk (Login)</span>
              </button>
              <button
                type="button"
                id="tab-auth-register"
                onClick={() => {
                  setAuthMode('register');
                  setErrorMessage(null);
                  setIsExistingEmailError(false);
                  setShowPasswordErrorPopup(false);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Daftar Akun Baru</span>
              </button>
            </div>

            {/* FORM 1: LOGIN */}
            {authMode === 'login' && (
              <form onSubmit={handleEmailLogin} className="space-y-3.5 bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Alamat Email:
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      id="input-login-email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="contoh: nama@email.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Kata Sandi (Minimal 6 karakter):
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      ref={passwordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      id="input-login-password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setErrorMessage(null);
                        setShowPasswordErrorPopup(false);
                      }}
                      placeholder="Minimal 6 karakter"
                      minLength={6}
                      className={`w-full pl-9 pr-10 py-2.5 bg-white dark:bg-slate-900 border rounded-xl text-xs text-slate-800 dark:text-white font-medium focus:outline-none shadow-2xs ${
                        showPasswordErrorPopup
                          ? 'border-rose-500 ring-2 ring-rose-500/20'
                          : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500'
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Minimal 6 karakter kata sandi yang telah didaftarkan.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSyncing}
                  id="btn-submit-login-account"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isSyncing ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
                </button>
              </form>
            )}

            {/* FORM 2: REGISTER */}
            {authMode === 'register' && (
              <form onSubmit={handleEmailRegister} className="space-y-3.5 bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Pemain / Kreator:
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      id="input-reg-name"
                      value={regNameInput}
                      onChange={(e) => setRegNameInput(e.target.value)}
                      placeholder={name || 'Nama Anda'}
                      maxLength={25}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Alamat Email:
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      id="input-reg-email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setErrorMessage(null);
                        setIsExistingEmailError(false);
                      }}
                      placeholder="contoh: nama@email.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Buat Kata Sandi (Minimal 6 karakter):
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="input-reg-password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="Minimal 6 karakter"
                      minLength={6}
                      className="w-full pl-9 pr-10 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-indigo-500 shadow-2xs"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    Kata sandi harus terdiri dari minimal 6 karakter.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSyncing}
                  id="btn-submit-register-account"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSyncing ? 'Mendaftarkan...' : 'Daftar & Hubungkan ke Cloud'}</span>
                </button>
              </form>
            )}

            {/* Security Guarantee */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong className="text-slate-800 dark:text-slate-200">Data Aman & Terenkripsi:</strong>
                <p className="mt-0.5">
                  Semua teka-teki silang, draf, dan progres bermain Anda tersimpan di cloud database sehingga tidak akan hilang saat ganti browser atau perangkat.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* SCENARIO B: USER IS LOGGED IN -> SHOW STATUS AKUN CLOUD & EDIT PROFIL TABS */
          /* ========================================================================= */
          <div className="space-y-4">
            {/* Sub Navigation Tabs for Logged-In Users */}
            <div className="flex items-center gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                id="tab-sub-status-cloud"
                onClick={() => setActiveSubTab('cloud')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSubTab === 'cloud'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Status Akun Cloud</span>
              </button>
              <button
                type="button"
                id="tab-sub-profil-user"
                onClick={() => setActiveSubTab('profile')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSubTab === 'profile'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Profil Pemain</span>
              </button>
            </div>

            {/* TAB: CLOUD STATUS */}
            {activeSubTab === 'cloud' && (
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    {userProfile.photoUrl ? (
                      <img
                        src={userProfile.photoUrl}
                        alt={userProfile.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500 shadow-xs"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white text-2xl flex items-center justify-center shadow-xs">
                        {userProfile.avatar || '🦊'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800 dark:text-white text-sm">
                          {userProfile.name}
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Terverifikasi
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[200px] sm:max-w-xs">
                        {userProfile.email}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cloud Protection Summary Cards (Clickable to view TTS list) */}
                <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-200 dark:border-slate-700/60 my-3">
                  <button
                    type="button"
                    id="btn-stat-my-puzzles"
                    onClick={() => {
                      if (onNavigateTab) {
                        onNavigateTab('my');
                        onClose();
                      }
                    }}
                    className="text-center p-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer group shadow-2xs"
                    title="Klik untuk melihat daftar TTS yang Anda Publikasikan"
                  >
                    <span className="block text-base font-black text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                      {myPuzzlesCount}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      TTS Dibuat
                    </span>
                  </button>

                  <button
                    type="button"
                    id="btn-stat-draft-puzzles"
                    onClick={() => {
                      if (onNavigateTab) {
                        onNavigateTab('drafts');
                        onClose();
                      }
                    }}
                    className="text-center p-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-amber-50 dark:hover:bg-amber-950/50 border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 transition-all cursor-pointer group shadow-2xs"
                    title="Klik untuk melihat daftar Draf TTS Anda"
                  >
                    <span className="block text-base font-black text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                      {draftPuzzlesCount}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      Draf TTS
                    </span>
                  </button>

                  <button
                    type="button"
                    id="btn-stat-solved-puzzles"
                    onClick={() => {
                      if (onNavigateTab) {
                        onNavigateTab('leaderboard');
                        onClose();
                      }
                    }}
                    className="text-center p-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all cursor-pointer group shadow-2xs"
                    title="Klik untuk melihat papan peringkat & rekor permainan"
                  >
                    <span className="block text-base font-black text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                      {solvedPuzzlesCount}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                      TTS Selesai
                    </span>
                  </button>
                </div>

                <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 mb-4">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-medium">
                      <strong>Akun Terlindungi:</strong> Teka-teki dan progres otomatis disinkronisasi ke cloud. Anda dapat membuka akun di perangkat lain kapan saja.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-trigger-cloud-sync-active"
                    disabled={isSyncing}
                    onClick={handleManualSync}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                  </button>

                  <button
                    type="button"
                    id="btn-logout-cloud-account"
                    onClick={handleLogout}
                    className="py-2.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Keluar dari Akun Cloud"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>

                {userProfile.lastSyncedAt && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2.5 text-center font-medium">
                    Sinkronisasi terakhir: {new Date(userProfile.lastSyncedAt).toLocaleString('id-ID')}
                  </p>
                )}

                {/* Quick Key */}
                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Kunci ID Akun:</span>
                  <button
                    type="button"
                    id="btn-copy-quick-key"
                    onClick={handleCopySyncKey}
                    className="font-mono text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>{userProfile.syncKey}</span>
                    {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: EDIT PROFILE (Only for logged-in users) */}
            {activeSubTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-4 bg-slate-50 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Pilih Karakter Avatar:
                  </label>
                  <div className="grid grid-cols-8 gap-2">
                    {AVATAR_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setSelectedAvatar(emoji)}
                        className={`h-9 text-lg rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                          selectedAvatar === emoji
                            ? 'bg-indigo-600 text-white scale-110 shadow-xs border-2 border-indigo-600'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Pemain / Kreator TTS:
                  </label>
                  <input
                    type="text"
                    id="input-user-profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 font-medium"
                    maxLength={25}
                    required
                  />
                </div>

                <button
                  type="submit"
                  id="btn-save-profile"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan Profil</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
