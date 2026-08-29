import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Flame,
  Heart,
  Play,
  Share2,
  Sparkles,
  Trophy,
  User,
} from 'lucide-react';
import { CrosswordPuzzle, UserProfile } from '../types/tts';
import { CloudService } from '../services/cloudService';
import { StorageService } from '../services/storageService';

export interface CreatorRef {
  id?: string;
  name: string;
  avatar?: string;
  email?: string;
}

interface CreatorProfileViewProps {
  creator: CreatorRef;
  userProfile: UserProfile;
  onBack: () => void;
  onPlayPuzzle: (puzzle: CrosswordPuzzle) => void;
  onSharePuzzle?: (puzzle: CrosswordPuzzle) => void;
  onOpenSyncModal?: () => void;
}

function matchesCreator(p: CrosswordPuzzle, c: CreatorRef): boolean {
  if (c.id && p.authorId && p.authorId === c.id) return true;
  if (c.email && p.authorEmail && p.authorEmail.toLowerCase() === c.email.toLowerCase()) return true;
  // Fallback: same display name (less reliable, only if no id)
  if (!c.id && !p.authorId && c.name && p.authorName === c.name) return true;
  return false;
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export const CreatorProfileView: React.FC<CreatorProfileViewProps> = ({
  creator,
  userProfile,
  onBack,
  onPlayPuzzle,
  onSharePuzzle,
  onOpenSyncModal,
}) => {
  const [puzzles, setPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await CloudService.getCommunityPuzzles();
        if (!cancelled) setPuzzles(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setPuzzles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creator.id, creator.email, creator.name]);

  useEffect(() => {
    const onPlay = (e: Event) => {
      const d = (e as CustomEvent)?.detail;
      if (!d?.puzzleId) return;
      setPuzzles((prev) =>
        prev.map((p) =>
          p.id === d.puzzleId
            ? {
                ...p,
                playsCount: d.playsCount ?? (Number(p.playsCount) || 0) + 1,
                lastPlayerName: d.lastPlayerName || p.lastPlayerName,
                lastPlayerAvatar: d.lastPlayerAvatar || p.lastPlayerAvatar,
                lastPlayedAt: d.lastPlayedAt || Date.now(),
              }
            : p
        )
      );
    };
    window.addEventListener('tts-play-recorded', onPlay);
    return () => window.removeEventListener('tts-play-recorded', onPlay);
  }, []);

  const creatorPuzzles = useMemo(() => {
    return puzzles
      .filter((p) => !p.isDraft && !p.isBanned && matchesCreator(p, creator))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [puzzles, creator]);

  const stats = useMemo(() => {
    const totalCreated = creatorPuzzles.length;
    const totalPlays = creatorPuzzles.reduce((s, p) => s + (p.playsCount || 0), 0);
    const totalCompletions = creatorPuzzles.reduce((s, p) => s + (p.completionsCount || 0), 0);
    const totalReactions = creatorPuzzles.reduce((s, p) => {
      const r = p.reactions;
      if (!r) return s;
      return (
        s +
        (r.like || 0) +
        (r.love || 0) +
        (r.fire || 0) +
        (r.clap || 0) +
        (r.wow || 0)
      );
    }, 0);
    const featured = creatorPuzzles.filter((p) => p.isFeatured).length;
    return { totalCreated, totalPlays, totalCompletions, totalReactions, featured };
  }, [creatorPuzzles]);

  const displayName = creator.name || 'Kreator TTS';
  const displayAvatar = creator.avatar || '🦊';
  const isSelf =
    userProfile.isLoggedIn &&
    ((creator.id && userProfile.id === creator.id) ||
      (creator.email && userProfile.email && creator.email === userProfile.email));

  const handlePlay = (puzzle: CrosswordPuzzle) => {
    if (!userProfile.isLoggedIn) {
      onOpenSyncModal?.();
      return;
    }
    onPlayPuzzle(puzzle);
  };

  const handleShareProfile = async () => {
    const base = window.location.origin + window.location.pathname;
    const key = creator.id || encodeURIComponent(creator.name);
    const url = `${base}#creator/${key}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Profil ${displayName} — Teka Teki Sharing`,
          text: `Lihat TTS buatan ${displayName} di Teka Teki Sharing`,
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert('Link profil disalin ke clipboard');
      }
    } catch {
      // user cancelled share
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          id="btn-creator-back"
          onClick={onBack}
          className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Profil Publik</p>
          <h1 className="text-lg font-black text-slate-900 dark:text-white truncate">Kreator TTS</h1>
        </div>
        <button
          type="button"
          id="btn-creator-share-profile"
          onClick={handleShareProfile}
          className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 cursor-pointer transition-colors"
          title="Bagikan profil"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* Identity card */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-indigo-50/60 dark:from-slate-900 dark:to-indigo-950/30 p-5 shadow-sm">
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-indigo-400/10 blur-2xl pointer-events-none" />
        <div className="flex items-center gap-4 relative">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-3xl shadow-sm ring-2 ring-indigo-200/60 dark:ring-indigo-800/60">
            {displayAvatar}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-black text-slate-900 dark:text-white truncate flex items-center gap-2">
              {displayName}
              {isSelf && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Anda
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
              <User className="w-3 h-3" />
              {stats.totalCreated} TTS publik
              {stats.featured > 0 && (
                <>
                  <span className="text-slate-300 dark:text-slate-600">·</span>
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  {stats.featured} featured
                </>
              )}
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {[
            { label: 'TTS Dibuat', value: stats.totalCreated, icon: BookOpen, color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'Dimainkan', value: stats.totalPlays, icon: Play, color: 'text-sky-600 dark:text-sky-400' },
            { label: 'Diselesaikan', value: stats.totalCompletions, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Reaksi', value: stats.totalReactions, icon: Heart, color: 'text-rose-600 dark:text-rose-400' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <s.icon className={`w-3 h-3 ${s.color}`} />
                {s.label}
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {s.value.toLocaleString('id-ID')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Puzzle list */}
      <div>
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          TTS Publik
        </h3>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm">Memuat TTS kreator…</div>
        ) : creatorPuzzles.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
            <Flame className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada TTS publik dari kreator ini.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {creatorPuzzles.map((puzzle) => {
              const reactionCount = puzzle.reactions
                ? (puzzle.reactions.like || 0) +
                  (puzzle.reactions.love || 0) +
                  (puzzle.reactions.fire || 0) +
                  (puzzle.reactions.clap || 0) +
                  (puzzle.reactions.wow || 0)
                : 0;
              return (
                <li
                  key={puzzle.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 dark:text-white truncate">{puzzle.title}</h4>
                        {puzzle.isFeatured && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Featured
                          </span>
                        )}
                        {puzzle.difficulty && (
                          <span className="text-[10px] font-semibold text-slate-400">{puzzle.difficulty}</span>
                        )}
                      </div>
                      {puzzle.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{puzzle.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-400">
                        <span>{puzzle.width}×{puzzle.height}</span>
                        <span>·</span>
                        <span>{formatDate(puzzle.createdAt)}</span>
                        <span>·</span>
                        <span>{puzzle.playsCount || 0} plays</span>
                        {puzzle.lastPlayerName ? (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <span>{puzzle.lastPlayerAvatar || '🎮'}</span>
                              <span className="truncate max-w-[100px]">{puzzle.lastPlayerName}</span>
                            </span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{reactionCount} reaksi</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        type="button"
                        id={`btn-creator-play-${puzzle.id}`}
                        onClick={() => handlePlay(puzzle)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Mainkan
                      </button>
                      {onSharePuzzle && (
                        <button
                          type="button"
                          id={`btn-creator-share-${puzzle.id}`}
                          onClick={() => onSharePuzzle(puzzle)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Share2 className="w-3 h-3" />
                          Bagikan
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
