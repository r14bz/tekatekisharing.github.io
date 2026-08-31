import React, { useEffect, useState, useCallback } from 'react';
import { X, AlertCircle, CheckCircle2, Info, Lock } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error' | 'warning' | 'auth';

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();

/** Panggil dari mana saja: showToast('Login dulu', 'auth', { actionLabel: 'Login', onAction: openModal }) */
export function showToast(
  message: string,
  type: ToastType = 'info',
  opts?: { durationMs?: number; actionLabel?: string; onAction?: () => void }
) {
  const item: ToastItem = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    message,
    type,
    durationMs: opts?.durationMs ?? (type === 'auth' ? 4500 : 3200),
    actionLabel: opts?.actionLabel,
    onAction: opts?.onAction,
  };
  listeners.forEach((fn) => fn(item));
}

const ICONS: Record<ToastType, React.ReactNode> = {
  info: <Info className="w-4 h-4 shrink-0" />,
  success: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 shrink-0" />,
  warning: <AlertCircle className="w-4 h-4 shrink-0" />,
  auth: <Lock className="w-4 h-4 shrink-0" />,
};

const STYLES: Record<ToastType, string> = {
  info: 'bg-slate-900 text-white border-slate-700',
  success: 'bg-emerald-600 text-white border-emerald-500',
  error: 'bg-rose-600 text-white border-rose-500',
  warning: 'bg-amber-500 text-white border-amber-400',
  auth: 'bg-indigo-600 text-white border-indigo-500',
};

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: ToastItem) => {
    setItems((prev) => [...prev.slice(-4), t]);
    const ms = t.durationMs ?? 3200;
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== t.id));
    }, ms);
  }, []);

  useEffect(() => {
    listeners.add(push);
    return () => {
      listeners.delete(push);
    };
  }, [push]);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,420px)] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl shadow-lg border text-sm font-semibold animate-in fade-in slide-in-from-bottom-2 ${STYLES[t.type]}`}
          role="status"
        >
          {ICONS[t.type]}
          <span className="flex-1 leading-snug">{t.message}</span>
          {t.actionLabel && t.onAction && (
            <button
              type="button"
              className="shrink-0 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold cursor-pointer"
              onClick={() => {
                t.onAction?.();
                setItems((prev) => prev.filter((x) => x.id !== t.id));
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button
            type="button"
            className="shrink-0 p-0.5 rounded-md hover:bg-white/15 cursor-pointer opacity-80"
            aria-label="Tutup"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastHost;
