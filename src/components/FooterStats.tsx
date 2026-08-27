import React, { useEffect, useState, useRef } from 'react';
import { Eye, Activity, ShieldCheck } from 'lucide-react';

interface FooterStatsProps {
  onOpenAdmin?: () => void;
}

interface PresenceStats {
  
Visits: number;
  online: number;
}

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

export const FooterStats: React.FC<FooterStatsProps> = ({ onOpenAdmin }) => {
  const [stats, setStats] = useState<PresenceStats>({ totalVisits: 0, online: 1 });
  const clientIdRef = useRef<string>('');

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
    <footer className="w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md text-slate-600 dark:text-slate-400 py-4 border-t border-slate-200 dark:border-slate-800/80 mt-16 transition-colors duration-200 text-xs">
      <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Info Singkat Brand */}
        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
          <span>Teka Teki Sharing</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-500">Share Your Puzzle!</span>
          {onOpenAdmin && (
            <>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <button
                type="button"
                onClick={onOpenAdmin}
                className="hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-3 h-3 text-indigo-500" />
                <span>Admin</span>
              </button>
            </>
          )}
        </div>

        {/* Statistik realtime */}
        <div className="flex items-center gap-5 bg-slate-100/80 dark:bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-200/60 dark:border-slate-700/40 shadow-sm">
          <div className="flex items-center gap-1.5" title="Total kunjungan situs">
            <Eye className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
            <span>
              <strong className="text-slate-900 dark:text-slate-100">
                {formatNumber(stats.totalVisits)}
              </strong>{' '}
              Visitor
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

        {/* Copyright */}
        <div className="text-slate-400 dark:text-slate-500 text-center sm:text-right">
          &copy; {new Date().getFullYear()} Teka Teki Sharing
        </div>
      </div>
    </footer>
  );
};
