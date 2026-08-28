import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Zap, Filter, Sparkles, Award, Medal, Flame, Timer, Crown, ChevronRight } from 'lucide-react';
import { CrosswordPuzzle, LeaderboardEntry } from '../types/tts';
import { formatTime, calculateScore, getSpeedCategory } from '../services/gridBuilder';
import { StorageService } from '../services/storageService';
import { CloudService } from '../services/cloudService';

interface LeaderboardViewProps {
  currentPuzzle?: CrosswordPuzzle | null;
  onPlayPuzzle?: (puzzle: CrosswordPuzzle) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  currentPuzzle,
  onPlayPuzzle,
}) => {
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>(
    currentPuzzle ? currentPuzzle.id : 'all'
  );
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [allPuzzles, setAllPuzzles] = useState<CrosswordPuzzle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const puzzles = StorageService.getCommunityPuzzles();
    setAllPuzzles(puzzles);

    if (currentPuzzle && selectedPuzzleId === 'all') {
      setSelectedPuzzleId(currentPuzzle.id);
    }
  }, [currentPuzzle]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    async function loadLeaderboard() {
      const validPuzzles = StorageService.getCommunityPuzzles();
      const validIds = new Set(validPuzzles.map((p) => p.id));

      if (selectedPuzzleId === 'all') {
        const cloudGlobal = await CloudService.getGlobalLeaderboards();
        const filtered = cloudGlobal.filter((e) => validIds.has(e.puzzleId));
        const formatted = filtered.map((e) => ({
          ...e,
          score: e.score || calculateScore(e.timeMs, 25),
        }));
        // Sort strictly by fastest completion time (timeMs ascending), then score descending
        formatted.sort((a, b) => {
          const timeDiff = (a.timeMs || 0) - (b.timeMs || 0);
          if (timeDiff !== 0) return timeDiff;
          return (b.score || 0) - (a.score || 0);
        });
        if (isMounted) {
          setLeaderboardData(formatted.slice(0, 100));
          setIsLoading(false);
        }
      } else {
        if (!validIds.has(selectedPuzzleId)) {
          if (isMounted) {
            setLeaderboardData([]);
            setIsLoading(false);
          }
          return;
        }
        const cloudList = await CloudService.getLeaderboard(selectedPuzzleId);
        const formatted = cloudList.map((e) => ({
          ...e,
          score: e.score || calculateScore(e.timeMs, 25),
        }));
        // Sort strictly by fastest completion time (timeMs ascending), then score descending
        formatted.sort((a, b) => {
          const timeDiff = (a.timeMs || 0) - (b.timeMs || 0);
          if (timeDiff !== 0) return timeDiff;
          return (b.score || 0) - (a.score || 0);
        });
        if (isMounted) {
          setLeaderboardData(formatted);
          setIsLoading(false);
        }
      }
    }

    loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [selectedPuzzleId]);

  const selectedPuzzle = allPuzzles.find((p) => p.id === selectedPuzzleId);

  return (
    <div id="leaderboard-view-container" className="w-full max-w-4xl mx-auto p-3 sm:p-6 pb-20">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-600 rounded-3xl p-5 sm:p-7 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0">
              <Trophy className="w-7 h-7 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-amber-100 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-300 fill-amber-300" /> Speedrun Leaderboard
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Papan Peringkat Tercepat
              </h2>
              <p className="text-xs sm:text-sm text-amber-100/90 font-medium">
                Peringkat diurutkan dari penyelesaian TTS <strong>tercepat</strong>. Makin kilat, makin besar bonus poin!
              </p>
            </div>
          </div>

          {/* Puzzle Selector */}
          <div className="w-full sm:w-auto min-w-[240px] bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-2.5">
            <label className="block text-[11px] text-amber-100 font-bold mb-1.5 flex items-center gap-1">
              <Filter className="w-3 h-3 text-amber-200" /> Filter Teka-Teki:
            </label>
            <select
              id="select-leaderboard-puzzle"
              value={selectedPuzzleId}
              onChange={(e) => setSelectedPuzzleId(e.target.value)}
              className="w-full bg-white text-slate-800 text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-xs cursor-pointer"
            >
              <option value="all">🌐 Semua Teka-Teki (Rekor Global)</option>
              {allPuzzles.map((p) => (
                <option key={p.id} value={p.id}>
                  🧩 {p.title} ({p.authorName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action button to play selected puzzle if filtered */}
        {selectedPuzzle && onPlayPuzzle && (
          <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
            <span className="text-xs text-amber-100 font-medium">
              Tantang diri Anda untuk mengalahkan rekor di "{selectedPuzzle.title}"!
            </span>
            <button
              type="button"
              onClick={() => onPlayPuzzle(selectedPuzzle)}
              className="px-3.5 py-1.5 bg-white hover:bg-amber-50 text-indigo-900 font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
            >
              <span>Mainkan TTS Ini</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Leaderboard Table / Cards */}
      {isLoading ? (
        <div
          id="leaderboard-skeleton"
          className="space-y-3"
          aria-busy="true"
          aria-label="Memuat papan peringkat"
        >
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 ${
                  i === 1 ? 'scale-105 order-2' : i === 0 ? 'order-1 mt-4' : 'order-3 mt-4'
                }`}
              >
                <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
                <div className="mx-auto h-3 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse mb-2" />
                <div className="mx-auto h-6 w-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              </div>
            ))}
          </div>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shadow-2xs"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-2.5 w-40 max-w-full rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
                </div>
              </div>
              <div className="h-10 w-24 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      ) : leaderboardData.length === 0 ? (
        <div
          id="leaderboard-empty-state"
          className="text-center py-16 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xs"
        >
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-amber-200 text-amber-500">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">Belum Ada Rekor Penyelesaian</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-4">
            Jadilah orang pertama yang menyelesaikan teka-teki silang ini secepat mungkin dan raih Medali Emas di puncak klasemen!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Top 3 Summary Podiums if applicable */}
          {leaderboardData.length >= 3 && selectedPuzzleId !== 'all' && (
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
              {/* 2nd Place */}
              <div className="bg-gradient-to-b from-slate-100 to-slate-200 border-2 border-slate-300 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-end shadow-xs order-1 mt-4">
                <div className="relative mb-1">
                  <span className="text-2xl sm:text-3xl">{leaderboardData[1].playerAvatar || '🥈'}</span>
                  <span className="absolute -top-1 -right-1 text-sm">🥈</span>
                </div>
                <div className="text-xs font-black text-slate-800 truncate max-w-full">
                  {leaderboardData[1].playerName}
                </div>
                <div className="text-[11px] font-bold font-mono text-slate-700 bg-white/70 px-2 py-0.5 rounded-md mt-1">
                  ⏱️ {formatTime(leaderboardData[1].timeMs)}
                </div>
                <div className="text-[10px] font-black text-indigo-700 mt-0.5">
                  ⚡ {leaderboardData[1].score?.toLocaleString('id-ID')} Poin
                </div>
                <div className="mt-2 text-[10px] font-extrabold uppercase px-2 py-0.5 bg-slate-400/20 text-slate-700 rounded-full">
                  Juara 2 (Perak)
                </div>
              </div>

              {/* 1st Place */}
              <div className="bg-gradient-to-b from-amber-100 via-amber-200 to-yellow-300 border-2 border-amber-400 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-end shadow-md order-2 relative overflow-hidden scale-105 z-10">
                <div className="absolute top-1 right-1 text-amber-600/40">
                  <Crown className="w-5 h-5" />
                </div>
                <div className="relative mb-1">
                  <span className="text-3xl sm:text-4xl">{leaderboardData[0].playerAvatar || '🥇'}</span>
                  <span className="absolute -top-1.5 -right-2 text-base animate-bounce">👑</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-slate-900 truncate max-w-full">
                  {leaderboardData[0].playerName}
                </div>
                <div className="text-xs font-black font-mono text-amber-950 bg-white/80 px-2.5 py-0.5 rounded-lg mt-1 border border-amber-300 shadow-2xs">
                  ⏱️ {formatTime(leaderboardData[0].timeMs)}
                </div>
                <div className="text-[11px] font-black text-indigo-900 mt-0.5">
                  ⚡ {leaderboardData[0].score?.toLocaleString('id-ID')} Poin
                </div>
                <div className="mt-2 text-[10px] font-black uppercase px-2.5 py-0.5 bg-amber-500 text-white rounded-full shadow-xs">
                  🥇 Juara 1 (Emas)
                </div>
              </div>

              {/* 3rd Place */}
              <div className="bg-gradient-to-b from-amber-50 via-orange-100 to-amber-200 border-2 border-amber-300 rounded-2xl p-3 sm:p-4 text-center flex flex-col items-center justify-end shadow-xs order-3 mt-6">
                <div className="relative mb-1">
                  <span className="text-2xl sm:text-3xl">{leaderboardData[2].playerAvatar || '🥉'}</span>
                  <span className="absolute -top-1 -right-1 text-sm">🥉</span>
                </div>
                <div className="text-xs font-black text-slate-800 truncate max-w-full">
                  {leaderboardData[2].playerName}
                </div>
                <div className="text-[11px] font-bold font-mono text-slate-700 bg-white/70 px-2 py-0.5 rounded-md mt-1">
                  ⏱️ {formatTime(leaderboardData[2].timeMs)}
                </div>
                <div className="text-[10px] font-black text-indigo-700 mt-0.5">
                  ⚡ {leaderboardData[2].score?.toLocaleString('id-ID')} Poin
                </div>
                <div className="mt-2 text-[10px] font-extrabold uppercase px-2 py-0.5 bg-orange-400/20 text-orange-800 rounded-full">
                  Juara 3 (Perunggu)
                </div>
              </div>
            </div>
          )}

          {/* List Entries */}
          {leaderboardData.map((entry, index) => {
            const rank = index + 1;
            const isTop1 = rank === 1;
            const isTop2 = rank === 2;
            const isTop3 = rank === 3;
            const entryScore = entry.score || calculateScore(entry.timeMs, 25);
            const speedTier = getSpeedCategory(entry.timeMs);

            return (
              <div
                key={entry.id || `${entry.puzzleId}-${index}`}
                id={`leaderboard-item-${rank}`}
                className={`flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all ${
                  isTop1
                    ? 'bg-gradient-to-r from-amber-50/90 via-yellow-50/70 to-amber-100/40 border-amber-300 shadow-sm'
                    : isTop2
                    ? 'bg-gradient-to-r from-slate-50 via-slate-100/70 to-slate-200/40 border-slate-300 shadow-2xs'
                    : isTop3
                    ? 'bg-gradient-to-r from-orange-50/80 via-amber-50/60 to-orange-100/30 border-orange-200 shadow-2xs'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                {/* Left: Rank Medal/Badge + Avatar + Name + Title */}
                <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
                  {/* Distinct Medal Badge */}
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl font-black flex flex-col items-center justify-center shrink-0 shadow-xs border ${
                      isTop1
                        ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-yellow-500 border-amber-300 text-amber-950'
                        : isTop2
                        ? 'bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 border-slate-300 text-slate-900'
                        : isTop3
                        ? 'bg-gradient-to-b from-orange-200 via-amber-300 to-orange-400 border-orange-300 text-orange-950'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {isTop1 ? (
                      <span className="text-xl leading-none">🥇</span>
                    ) : isTop2 ? (
                      <span className="text-xl leading-none">🥈</span>
                    ) : isTop3 ? (
                      <span className="text-xl leading-none">🥉</span>
                    ) : (
                      <span className="text-sm font-black">#{rank}</span>
                    )}
                  </div>

                  {/* Player Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg shrink-0">{entry.playerAvatar || '🦊'}</span>
                      <span className="font-black text-slate-800 text-sm sm:text-base truncate max-w-[140px] sm:max-w-[200px]">
                        {entry.playerName}
                      </span>
                      {/* Speed Badge */}
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${speedTier.bg} ${speedTier.color} hidden sm:inline-flex items-center gap-1`}
                      >
                        {speedTier.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-slate-500 text-[11px] font-medium">
                      <span className="truncate max-w-[130px] sm:max-w-[220px]">
                        {entry.puzzleTitle}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(entry.completedAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Duration (Highlighted as Primary Ranking Criteria) & Points */}
                <div className="flex items-center gap-3 sm:gap-5 text-right shrink-0">
                  {/* Primary Duration Column */}
                  <div className="flex flex-col items-end bg-indigo-50/80 border border-indigo-100 px-2.5 sm:px-3 py-1.5 rounded-xl">
                    <div className="flex items-center gap-1 text-indigo-950 font-black font-mono text-xs sm:text-sm">
                      <Timer className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>{formatTime(entry.timeMs)}</span>
                    </div>
                    <span className="text-[9px] font-extrabold text-indigo-600 uppercase tracking-wider">
                      Waktu Tercepat
                    </span>
                  </div>

                  {/* Points Column */}
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-amber-600 font-black text-xs sm:text-base">
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                      <span className="font-mono">{entryScore.toLocaleString('id-ID')}</span>
                      <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">Poin</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">
                      Skor Poin
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
