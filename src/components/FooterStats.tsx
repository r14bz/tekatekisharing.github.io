import React, { useEffect, useState, useRef } from 'react';
import { Eye, Activity, Palette, Check, Download } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface PresenceStats {
  totalVisits: number;
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
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#0ea5e9,#06b6d4)', ring: '#0ea5e9' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg,#10b981,#14b8a6)', ring: '#10b981' },
  { id: 'rose', label: 'Rose', swatch: 'linear-gradient(135deg,#f43f5e,#ec4899)', ring: '#f43f5e' },
  { id: 'amber', label: 'Amber', swatch: 'linear-gradient(135deg,#f59e0b,#f97316)', ring: '#f59e0b' },
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
  const [stats, setStats] = useState<PresenceStats>({ totalVisits: 0, online: 1 });
  const [colorAccent, setColorAccent] = useState<string>(() => StorageService.getColorAccent());
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const clientIdRef = useRef<string>('');

  const handleSelectAccent = (id: string) => {
    setColorAccent(id);
    StorageService.setColorAccent(id);
  };

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    try {
      await installPrompt.userChoice;
    } catch { /* ignore */ }
    setInstallPrompt(null);
  };

  useEffect(() => {
    clientIdRef.current = getOrCreateClientId();
    let cancelled = false;

    const sendHeartbeat = async (countVisit: boolean) => {
      try {
        const res = await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            countVisit,
          }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.success) {
          setStats({
            totalVisits: Number(json.totalVisits) || 0,
            online: Math.max(1, Number(json.online) || 1),
          });
        }
      } catch {
        // silent — footer is non-critical
      }
    };

    // Count at most one visit per browser tab session
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
      if (document.visibilityState === 'visible') {
        sendHeartbeat(false);
      }
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
        {/* Info Singkat Brand */}
        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
          <span>Teka Teki Sharing</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-500">Share Your Puzzle!</span></div>

        {/* Statistik realtime */}
        <div className="flex items-center gap-5 bg-slate-100/80 dark:bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-slate-700/40 shadow-sm">
          <div className="flex items-center gap-1.5" title="Total kunjungan situs">
            <Eye className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">
                {formatNumber(stats.totalVisits)}
              </strong>{' '}
              Total Kunjungan
            </span>
          </div>

          <div className="w-px h-3 bg-slate-300 dark:bg-slate-700" />

          <div
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium"
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
        </div>

        {/* Color theme picker + copyright */}
        <div className="flex flex-col items-center sm:items-end gap-2">
          <div
            className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-end"
            role="group"
            aria-label="Pilih warna tema"
          >
            {!isStandalone && (
              <button
                type="button"
                id="btn-install-pwa"
                onClick={handleInstallApp}
                disabled={!installPrompt}
                title={
                  installPrompt
                    ? 'Pasang aplikasi ke layar utama'
                    : 'Di iOS: Bagikan → Add to Home Screen. Di Android/Chrome: menu browser → Install app.'
                }
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-all mr-1 ${
                  installPrompt
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-default'
                }`}
              >
                <Download className="w-3 h-3" />
                Install
              </button>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mr-0.5">
              <Palette className="w-3 h-3" />
              Tema
            </span>
            {COLOR_THEMES.map((t) => {
              const active = colorAccent === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  id={`btn-color-theme-${t.id}`}
                  onClick={() => handleSelectAccent(t.id)}
                  title={t.label}
                  aria-label={`Tema ${t.label}`}
                  aria-pressed={active}
                  className={`relative w-6 h-6 rounded-full border-2 transition-all cursor-pointer shadow-sm hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 ${
                    active
                      ? 'border-white dark:border-slate-900 ring-2 scale-110'
                      : 'border-white/80 dark:border-slate-700/80 opacity-90 hover:opacity-100'
                  }`}
                  style={{
                    background: t.swatch,
                    ...(active ? { boxShadow: `0 0 0 2px ${t.ring}` } : {}),
                  }}
                >
                  {active && (
                    <Check
                      className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow"
                      strokeWidth={3}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-slate-400 dark:text-slate-500 text-center sm:text-right">
            &copy; {new Date().getFullYear()} Teka Teki Sharing
          </div>
        </div>
      </div>
    </footer>
  );
};
