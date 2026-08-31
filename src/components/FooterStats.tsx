import React, { useEffect, useState, useRef } from 'react';
import { Activity, Palette, Check, Download } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface PresenceStats {
  online: number;
}

const COLOR_THEMES: {
  id: string;
  label: string;
  swatch: string;
  ring: string;
}[] = [
  { id: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg,#6366f1,#a855f7)', ring: '#6366f1' },
  { id: 'violet', label: 'Violet', swatch: 'linear-gradient(135deg,#8b5cf6,#d946ef)', ring: '#8b5cf6' },
  { id: 'fuchsia', label: 'Fuchsia', swatch: 'linear-gradient(135deg,#d946ef,#ec4899)', ring: '#d946ef' },
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', ring: '#0ea5e9' },
  { id: 'sky', label: 'Sky', swatch: 'linear-gradient(135deg,#38bdf8,#818cf8)', ring: '#38bdf8' },
  { id: 'teal', label: 'Teal', swatch: 'linear-gradient(135deg,#14b8a6,#0d9488)', ring: '#14b8a6' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg,#10b981,#14b8a6)', ring: '#10b981' },
  { id: 'lime', label: 'Lime', swatch: 'linear-gradient(135deg,#84cc16,#22c55e)', ring: '#84cc16' },
  { id: 'amber', label: 'Amber', swatch: 'linear-gradient(135deg,#f59e0b,#f97316)', ring: '#f59e0b' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#f97316,#ef4444)', ring: '#f97316' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg,#f43f5e,#ec4899)', ring: '#f43f5e' },
  { id: 'coral', label: 'Coral', swatch: 'linear-gradient(135deg,#fb7185,#f43f5e)', ring: '#fb7185' },
  { id: 'midnight', label: 'Midnight', swatch: 'linear-gradient(135deg,#312e81,#4c1d95)', ring: '#4338ca' },
  { id: 'slate', label: 'Slate', swatch: 'linear-gradient(135deg,#64748b,#475569)', ring: '#64748b' },
];

const CLIENT_ID_KEY = 'tts_presence_client_id';
const VISIT_FLAG_KEY = 'tts_visit_counted_v1';

function getOrCreateClientId(): string {
  try {
    let id = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        'c_' +
        Math.random().toString(36).slice(2, 10) +
        '_' +
        Date.now().toString(36);
      sessionStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return 'c_' + Math.random().toString(36).slice(2, 12);
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  return n.toLocaleString('id-ID');
}

export const FooterStats: React.FC = () => {
  const [stats, setStats] = useState<PresenceStats>({ online: 1 });
  const [colorAccent, setColorAccent] = useState<string>(() => StorageService.getColorAccent());
  const [canNativeInstall, setCanNativeInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const installPromptRef = useRef<any>(null);
  const clientIdRef = useRef<string>('');

  const activeTheme = COLOR_THEMES.find((t) => t.id === colorAccent) || COLOR_THEMES[0];

  const handleSelectAccent = (id: string) => {
    setColorAccent(id);
    StorageService.setColorAccent(id);
    setShowThemeMenu(false);
  };

  useEffect(() => {
    if (!showThemeMenu) return;
    const onDoc = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showThemeMenu]);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const onBip = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e;
      setCanNativeInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    const onInstalled = () => {
      installPromptRef.current = null;
      setCanNativeInstall(false);
      setIsStandalone(true);
      setShowInstallHelp(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    const promptEvent = installPromptRef.current;
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        promptEvent.prompt();
        await promptEvent.userChoice;
      } catch {
        /* dismissed */
      }
      installPromptRef.current = null;
      setCanNativeInstall(false);
      return;
    }
    setShowInstallHelp((v) => !v);
  };

  useEffect(() => {
    clientIdRef.current = getOrCreateClientId();
    let cancelled = false;

    const sendHeartbeat = async (countVisit: boolean) => {
      try {
        const profile = StorageService.getUserProfile();
        const res = await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            countVisit,
            userId: profile?.id || null,
            name: profile?.name || null,
            avatar: profile?.avatar || null,
          }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success) {
          setStats({ online: Math.max(0, Number(json.online) || 0) || 1 });
        }
      } catch {
        // silent
      }
    };

    let shouldCountVisit = false;
    try {
      if (!sessionStorage.getItem(VISIT_FLAG_KEY)) {
        sessionStorage.setItem(VISIT_FLAG_KEY, '1');
        shouldCountVisit = true;
      }
    } catch {
      shouldCountVisit = true;
    }

    sendHeartbeat(shouldCountVisit);
    const interval = setInterval(() => sendHeartbeat(false), 20000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') sendHeartbeat(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <footer className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-slate-600 dark:text-slate-400 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800/80 mt-16 transition-colors duration-200 text-xs">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
          <span>Teka Teki Sharing</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-500">Share Your Puzzle!</span>
        </div>

        <div className="relative flex flex-wrap items-center justify-center gap-2 sm:gap-3 bg-slate-100/80 dark:bg-slate-800/50 px-2.5 py-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/40 shadow-sm">
          {!isStandalone ? (
            <button
              type="button"
              id="btn-install-pwa"
              onClick={handleInstallApp}
              title="Pasang aplikasi ke layar utama"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              Install
              {canNativeInstall && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
              <Check className="w-3.5 h-3.5" />
              Terpasang
            </span>
          )}

          <div className="w-px h-3 bg-slate-300 dark:bg-slate-700 hidden sm:block" />

          <div
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium px-1"
            title="Pengguna yang sedang membuka situs"
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>
              <strong className="text-slate-900 dark:text-emerald-300">
                {formatNumber(stats.online)}
              </strong>{' '}
              Online
            </span>
          </div>

          <div className="w-px h-3 bg-slate-300 dark:bg-slate-700 hidden sm:block" />

          <div className="relative" ref={themeMenuRef}>
            <button
              type="button"
              id="btn-theme-dropdown"
              onClick={() => setShowThemeMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              aria-haspopup="listbox"
              aria-expanded={showThemeMenu}
              title="Pilih warna tema"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-white/80 shadow-sm shrink-0"
                style={{ background: activeTheme.swatch }}
              />
              <Palette className="w-3 h-3 text-slate-400" />
              <span className="max-w-[4.5rem] truncate">{activeTheme.label}</span>
              <svg
                className={`w-3 h-3 text-slate-400 transition-transform ${showThemeMenu ? 'rotate-180' : ''}`}
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {showThemeMenu && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1.5"
                role="listbox"
                aria-label="Daftar warna tema"
              >
                {COLOR_THEMES.map((t) => {
                  const active = colorAccent === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      id={`btn-color-theme-${t.id}`}
                      role="option"
                      aria-selected={active}
                      onClick={() => handleSelectAccent(t.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-slate-200 dark:border-slate-600 shadow-sm shrink-0"
                        style={{ background: t.swatch }}
                      />
                      <span className="flex-1">{t.label}</span>
                      {active && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" strokeWidth={2.5} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {showInstallHelp && !isStandalone && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed"
              role="dialog"
            >
              <p className="font-bold text-slate-800 dark:text-slate-100 mb-1.5">Pasang ke layar utama</p>
              <p className="mb-1">
                <strong>Android / Chrome:</strong> menu ⋮ → <em>Install app</em> / <em>Add to Home screen</em>
              </p>
              <p className="mb-2">
                <strong>iPhone / Safari:</strong> tombol Bagikan → <em>Add to Home Screen</em>
              </p>
              <button
                type="button"
                className="text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer"
                onClick={() => setShowInstallHelp(false)}
              >
                Tutup
              </button>
            </div>
          )}
        </div>

        <div className="text-slate-400 dark:text-slate-500 text-center sm:text-right">
          &copy; {new Date().getFullYear()} Teka Teki Sharing
        </div>
      </div>
    </footer>
  );
};
