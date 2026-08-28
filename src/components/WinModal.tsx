import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Clock, Home, Award, RotateCcw, ListOrdered, CheckCircle2, Zap } from 'lucide-react';
import { CrosswordPuzzle, LeaderboardEntry, UserProfile } from '../types/tts';
import { formatTime, calculateScore, getSpeedCategory } from '../services/gridBuilder';
import { StorageService } from '../services/storageService';
import { CloudService } from '../services/cloudService';

interface WinModalProps {
  isOpen: boolean;
  puzzle: CrosswordPuzzle;
  timeSpentMs: number;
  userProfile: UserProfile;
  onClose: () => void;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
  onHome: () => void;
}

export const WinModal: React.FC<WinModalProps> = ({
  isOpen,
  puzzle,
  timeSpentMs,
  userProfile,
  onClose,
  onRestart,
  onOpenLeaderboard,
  onHome,
}) => {
  const [userRank, setUserRank] = useState<number | null>(null);
  const submittedRef = React.useRef<string | null>(null);

  const totalCells = puzzle.grid.flat().filter((c) => c !== null && c !== '').length;
  const score = calculateScore(timeSpentMs, totalCells);
  const speedTier = getSpeedCategory(timeSpentMs);

  useEffect(() => {
    if (!isOpen) {
      submittedRef.current = null;
      return;
    }

    // Fire celebratory confetti sekali per buka modal
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    // Hindari submit ganda (StrictMode / dependency re-run)
    const submitKey = `${puzzle.id}:${timeSpentMs}:${userProfile.id || userProfile.name}`;
    if (submittedRef.current === submitKey) return;
    submittedRef.current = submitKey;

    if (!timeSpentMs || timeSpentMs <= 0) return;

    const entry: LeaderboardEntry = {
      id: 'lb_' + (userProfile.id || 'anon') + '_' + puzzle.id + '_' + Math.floor(timeSpentMs / 1000),
      puzzleId: puzzle.id,
      puzzleTitle: puzzle.title,
      playerName: userProfile.name || 'Pemain TTS',
      playerAvatar: userProfile.avatar || '🦊',
      playerId: userProfile.id,
      playerEmail: userProfile.email,
      timeMs: timeSpentMs,
      score: score,
      completedAt: Date.now(),
    };

    StorageService.addLeaderboardEntry(entry);
    CloudService.submitScore(puzzle.id, entry).then(() => {
      // Refresh rank dari cloud jika memungkinkan
      CloudService.getLeaderboard(puzzle.id).then((list) => {
        if (Array.isArray(list) && list.length) {
          const sorted = [...list].sort((a, b) => {
            const ta = a.timeMs || Infinity;
            const tb = b.timeMs || Infinity;
            if (ta !== tb) return ta - tb;
            return (b.score || 0) - (a.score || 0);
          });
          const idx = sorted.findIndex(
            (e) =>
              (userProfile.id && e.playerId === userProfile.id) ||
              e.timeMs === timeSpentMs
          );
          setUserRank(idx >= 0 ? idx + 1 : 1);
        }
      }).catch(() => {});
    });

    const allLeaderboard = StorageService.getLeaderboard(puzzle.id);
    const rank = allLeaderboard.findIndex((e) => e.timeMs === timeSpentMs) + 1;
    setUserRank(rank > 0 ? rank : 1);
  }, [isOpen, puzzle.id, puzzle.title, timeSpentMs, score, userProfile]);

  if (!isOpen) return null;

  return (
    <div
      id="win-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        id="win-modal-content"
        className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl relative text-center overflow-hidden"
      >
        {/* Victory Trophy Icon */}
        <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-amber-500 shadow-sm mb-3 animate-bounce">
          <Trophy className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight mb-1">
          Selamat! TTS Selesai! 🎉
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mb-3 font-medium">
          Anda berhasil menyelesaikan teka-teki silang{' '}
          <span className="font-bold text-slate-800">"{puzzle.title}"</span>
        </p>

        {/* Speed Tier Pill */}
        <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black shadow-2xs">
          <span className={speedTier.color}>{speedTier.icon} Kecepatan: {speedTier.label}</span>
        </div>

        {/* Score & Time Card - 3 columns */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-4 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mb-0.5">
              <Clock className="w-3 h-3 text-indigo-600" /> Waktu
            </span>
            <span className="text-base sm:text-lg font-black font-mono text-indigo-600">
              {formatTime(timeSpentMs)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-indigo-200 shadow-2xs bg-indigo-50/40">
            <span className="flex items-center gap-1 text-[10px] text-indigo-700 font-bold mb-0.5">
              <Zap className="w-3 h-3 text-amber-500 fill-amber-500" /> Skor Poin
            </span>
            <span className="text-base sm:text-lg font-black text-indigo-900 font-mono">
              {score.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="flex items-center gap-1 text-[10px] text-slate-500 font-medium mb-0.5">
              <Award className="w-3 h-3 text-amber-500" /> Peringkat
            </span>
            <span className="text-base sm:text-lg font-black text-amber-600">
              {userRank === 1 ? '🥇 #1' : userRank === 2 ? '🥈 #2' : userRank === 3 ? '🥉 #3' : `#${userRank ?? 1}`}
            </span>
          </div>
        </div>

        {/* Automatic Leaderboard Registration Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-5 flex items-center justify-center gap-2 text-emerald-800 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            Skor otomatis masuk ke Leaderboard sebagai <strong className="font-extrabold text-emerald-950">{userProfile.name}</strong> {userProfile.avatar}!
          </span>
        </div>

        {/* Action Buttons: Halaman Awal, Peringkat, and Lime Green Main Lagi */}
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            id="btn-win-home"
            onClick={onHome}
            className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 border border-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Home className="w-4 h-4 text-slate-600" />
            <span>Halaman Awal</span>
          </button>

          <button
            type="button"
            id="btn-win-leaderboard"
            onClick={onOpenLeaderboard}
            className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 text-amber-900 text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            <ListOrdered className="w-4 h-4 text-amber-600" />
            <span>Peringkat</span>
          </button>

          <button
            type="button"
            id="btn-win-restart"
            onClick={onRestart}
            className="flex flex-col items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl bg-lime-500 hover:bg-lime-600 active:bg-lime-700 text-slate-950 border border-lime-600 text-xs font-black transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw className="w-4 h-4 text-slate-950" />
            <span>Main Lagi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
