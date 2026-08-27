import React from 'react';
import { ArrowRight, ArrowDown, RefreshCw, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ClueItem } from '../types/tts';

interface TopClueBannerProps {
  activeClue: ClueItem | null;
  userGrid?: string[][];
  activeCell?: { row: number; col: number } | null;
  onCellClick?: (row: number, col: number) => void;
  onToggleDirection: () => void;
  onPrevClue?: () => void;
  onNextClue?: () => void;
  isWordCompleted?: boolean;
}

export const TopClueBanner: React.FC<TopClueBannerProps> = ({
  activeClue,
  onToggleDirection,
  onPrevClue,
  onNextClue,
  isWordCompleted = false,
}) => {
  if (!activeClue) {
    return (
      <div
        id="top-clue-banner-empty"
        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-center shadow-2xs"
      >
        <p className="text-slate-500 text-xs sm:text-sm font-medium">
          Ketuk salah satu kotak huruf untuk memilih soal & mulai mengetik
        </p>
      </div>
    );
  }

  const isAcross = activeClue.direction === 'across';

  return (
    <div
      id="top-clue-banner"
      className="w-full bg-white border border-indigo-100 rounded-xl p-2.5 sm:p-3 shadow-xs relative overflow-hidden transition-all"
    >
      {/* Accent left indicator */}
      <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>

      {/* Row 1: Badges & Navigation Buttons */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Direction Toggle Badge */}
          <button
            type="button"
            id="btn-banner-toggle-direction"
            onClick={onToggleDirection}
            title="Klik untuk ganti arah (Mendatar / Menurun)"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
          >
            {isAcross ? (
              <ArrowRight className="w-3 h-3 text-indigo-600 shrink-0" />
            ) : (
              <ArrowDown className="w-3 h-3 text-indigo-600 shrink-0" />
            )}
            <span>
              {activeClue.number}. {isAcross ? 'Mendatar' : 'Menurun'}
            </span>
            <span className="text-slate-400 font-normal text-[10px]">({activeClue.length} huruf)</span>
            <RefreshCw className="w-2.5 h-2.5 text-indigo-400 ml-0.5 opacity-80" />
          </button>

          {/* Word Complete Pill */}
          {isWordCompleted && (
            <span
              id="clue-word-completed-badge"
              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              <Check className="w-2.5 h-2.5 text-emerald-600" /> Selesai
            </span>
          )}
        </div>

        {/* Previous / Next Navigation */}
        <div className="flex items-center gap-1">
          {onPrevClue && (
            <button
              type="button"
              id="btn-prev-clue"
              onClick={onPrevClue}
              className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md border border-slate-200 transition-colors flex items-center text-xs font-bold cursor-pointer"
              title="Soal Sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {onNextClue && (
            <button
              type="button"
              id="btn-next-clue"
              onClick={onNextClue}
              className="p-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md border border-slate-200 transition-colors flex items-center text-xs font-bold cursor-pointer"
              title="Soal Berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Question text */}
      <div>
        <AnimatePresence mode="wait">
          <motion.p
            key={activeClue.id}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.12 }}
            id="clue-question-text"
            className="text-slate-900 text-sm sm:text-base font-bold leading-snug tracking-tight select-text"
          >
            {activeClue.question || (
              <span className="text-amber-600 italic font-normal text-xs">
                (Soal nomor {activeClue.number} belum memiliki deskripsi pertanyaan)
              </span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
};
