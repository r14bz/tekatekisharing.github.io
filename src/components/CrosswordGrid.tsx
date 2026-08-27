import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowDown, RefreshCw } from 'lucide-react';
import { Direction, CrosswordPuzzle, ClueItem } from '../types/tts';

interface CrosswordGridProps {
  puzzle: CrosswordPuzzle;
  userGrid: string[][];
  activeCell: { row: number; col: number } | null;
  activeDirection: Direction;
  activeClue: ClueItem | null;
  cellNumbers: (number | null)[][];
  onCellClick: (row: number, col: number) => void;
  onInputChange: (char: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onToggleDirection?: () => void;
  isReadOnly?: boolean;
  checkedFeedback?: {
    show: boolean;
    mistakes: { row: number; col: number }[];
    corrects: { row: number; col: number }[];
  } | null;
}

export const CrosswordGrid: React.FC<CrosswordGridProps> = ({
  puzzle,
  userGrid,
  activeCell,
  activeDirection,
  activeClue,
  cellNumbers,
  onCellClick,
  onInputChange,
  onKeyDown,
  onToggleDirection,
  isReadOnly = false,
  checkedFeedback = null,
}) => {
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const activeCellRef = useRef<HTMLDivElement | null>(null);

  // Keep focus on the persistent input without dismissing keyboard
  useEffect(() => {
    if (activeCell && activeInputRef.current && !isReadOnly) {
      if (document.activeElement !== activeInputRef.current) {
        activeInputRef.current.focus({ preventScroll: true });
      }
    }
  }, [activeCell, activeDirection, isReadOnly]);

  // Auto-scroll active cell so it stays visible ABOVE the on-screen keyboard
  useEffect(() => {
    if (!activeCell || isReadOnly) return;

    const scrollActiveAboveKeyboard = () => {
      const el = activeCellRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      // Visible area above the keyboard
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      // Keep ~120px of space above the bottom edge (above keyboard)
      const safeBottom = visibleBottom - 120;
      const safeTop = (vv ? vv.offsetTop : 0) + 80; // below navbar

      if (rect.bottom > safeBottom || rect.top < safeTop) {
        const delta =
          rect.bottom > safeBottom
            ? rect.bottom - safeBottom
            : rect.top - safeTop;
        window.scrollBy({ top: delta, behavior: 'smooth' });
      }
    };

    scrollActiveAboveKeyboard();
    const t1 = setTimeout(scrollActiveAboveKeyboard, 100);
    const t2 = setTimeout(scrollActiveAboveKeyboard, 320);

    const onViewportChange = () => scrollActiveAboveKeyboard();
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewportChange);
        window.visualViewport.removeEventListener('scroll', onViewportChange);
      }
    };
  }, [activeCell, activeDirection, isReadOnly]);

  // Determine if a cell belongs to the currently active clue word
  const isCellInActiveWord = (r: number, c: number): boolean => {
    if (!activeClue) return false;
    if (activeClue.direction === 'across') {
      return (
        r === activeClue.row &&
        c >= activeClue.col &&
        c < activeClue.col + activeClue.length
      );
    } else {
      return (
        c === activeClue.col &&
        r >= activeClue.row &&
        r < activeClue.row + activeClue.length
      );
    }
  };

  const cols = puzzle.width;
  const rows = puzzle.height;
  const isAcross = activeDirection === 'across';

  return (
    <div
      id="crossword-grid-container"
      className="w-full flex flex-col items-center justify-center select-none relative"
    >
      {/* Compact Quick Direction Switcher & Tip */}
      {onToggleDirection && !isReadOnly && (
        <div className="w-full flex items-center justify-between gap-1.5 mb-1.5 px-0.5">
          <button
            type="button"
            id="btn-quick-direction-toggle"
            onClick={onToggleDirection}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-indigo-700 hover:text-indigo-800 border border-slate-200 shadow-2xs text-[11px] font-bold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-indigo-500" />
            <span>Arah:</span>
            <span className="flex items-center gap-0.5 bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-800 font-bold">
              {isAcross ? (
                <>
                  <ArrowRight className="w-2.5 h-2.5 text-indigo-600" /> Mendatar
                </>
              ) : (
                <>
                  <ArrowDown className="w-2.5 h-2.5 text-indigo-600" /> Menurun
                </>
              )}
            </span>
          </button>

          <span className="text-[10px] text-slate-400 font-medium hidden xs:inline">
            Double Klik / Spasi: Ubah Arah
          </span>
        </div>
      )}

      {/* Crossword Grid Matrix Container (Clean transparent canvas without black boxes) */}
      <div
        id="crossword-grid-matrix"
        className="grid gap-1 sm:gap-1.5 p-1.5 sm:p-2.5 bg-slate-100/50 rounded-2xl border border-slate-200/60 w-full max-w-[320px] xs:max-w-[360px] sm:max-w-[400px] aspect-square mx-auto relative"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {/* 
          CRITICAL: PERSISTENT INPUT ELEMENT THAT NEVER UNMOUNTS!
          By staying permanently mounted in the DOM and simply updating its position style over the active cell,
          the mobile virtual keyboard NEVER closes or blurs while typing across consecutive cells.
        */}
        {!isReadOnly && activeCell && (
          <input
            ref={activeInputRef}
            id="crossword-persistent-native-input"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="absolute z-30 opacity-0 cursor-pointer caret-transparent p-0 m-0 border-0"
            style={{
              top: `calc(${(activeCell.row / rows) * 100}% + 6px)`,
              left: `calc(${(activeCell.col / cols) * 100}% + 6px)`,
              width: `calc(${100 / cols}% - 8px)`,
              height: `calc(${100 / rows}% - 8px)`,
            }}
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                const char = val.slice(-1).toUpperCase();
                if (/^[A-Z0-9]$/i.test(char)) {
                  onInputChange(char);
                }
              }
              e.target.value = '';
            }}
            onKeyDown={onKeyDown}
            aria-label={`Input Baris ${activeCell.row + 1} Kolom ${activeCell.col + 1}`}
          />
        )}

        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const isBlock = puzzle.grid[r][c] === null || puzzle.grid[r][c] === '';
            const isActive = activeCell?.row === r && activeCell?.col === c;
            const inActiveWord = isCellInActiveWord(r, c);
            const userChar = userGrid[r]?.[c] || '';
            const cellNumber = cellNumbers[r]?.[c];

            // 1. Kotak hitam kosong dihilangkan sepenuhnya (invisible agar layout grid tetap presisi)
            if (isBlock) {
              return (
                <div
                  key={`block-${r}-${c}`}
                  id={`cell-block-${r}-${c}`}
                  className="w-full h-full invisible pointer-events-none select-none"
                  aria-hidden="true"
                />
              );
            }

            // Check feedback state
            const isMistake = checkedFeedback?.show && checkedFeedback.mistakes.some(
              (m) => m.row === r && m.col === c
            );
            const isCorrect = checkedFeedback?.show && checkedFeedback.corrects.some(
              (cr) => cr.row === r && cr.col === c
            );

            return (
              <div
                key={`cell-${r}-${c}`}
                ref={isActive ? activeCellRef : null}
                id={`cell-${r}-${c}`}
                onClick={() => {
                  onCellClick(r, c);
                  if (activeInputRef.current && !isReadOnly) {
                    activeInputRef.current.focus();
                  }
                }}
                onDoubleClick={() => {
                  if (onToggleDirection && !isReadOnly) {
                    onToggleDirection();
                  }
                }}
                className={`w-full h-full rounded-lg sm:rounded-xl relative flex items-center justify-center font-bold transition-all duration-150 cursor-pointer text-sm xs:text-base sm:text-xl font-mono select-none shadow-xs ${
                  isActive
                    ? 'bg-indigo-600 text-white ring-2 sm:ring-4 ring-indigo-200 z-20 scale-[1.04] shadow-md'
                    : isMistake
                    ? 'bg-rose-50 text-rose-800 border-2 border-rose-500 z-10 animate-shake'
                    : isCorrect
                    ? 'bg-emerald-50 text-emerald-900 border-2 border-emerald-500 z-10'
                    : inActiveWord
                    ? 'bg-indigo-100/90 text-indigo-950 border-2 border-indigo-400 z-10'
                    : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 hover:border-slate-400'
                }`}
              >
                {/* Clue Number Indicator */}
                {cellNumber && (
                  <span
                    className={`absolute top-0.5 left-0.5 sm:left-1 text-[8px] sm:text-[10px] font-sans font-bold leading-none select-none ${
                      isActive
                        ? 'text-white/90'
                        : isMistake
                        ? 'text-rose-600'
                        : isCorrect
                        ? 'text-emerald-700'
                        : inActiveWord
                        ? 'text-indigo-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {cellNumber}
                  </span>
                )}

                {/* User Typed Letter */}
                {userChar ? (
                  <motion.span
                    key={`char-${r}-${c}-${userChar}`}
                    initial={{ scale: 1.2, opacity: 0.8 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.1 }}
                    className="leading-none transform translate-y-[1px]"
                  >
                    {userChar}
                  </motion.span>
                ) : isActive ? (
                  <span className="inline-flex items-center justify-center">
                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white animate-pulse shadow-sm ring-2 ring-white/60" />
                  </span>
                ) : (
                  <span className="leading-none transform translate-y-[1px] opacity-0">
                    A
                  </span>
                )}

                {/* Active Direction arrow indicator inside active cell */}
                {isActive && (
                  <div className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-indigo-700/80 text-white leading-none shadow-2xs">
                    {isAcross ? (
                      <ArrowRight className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    ) : (
                      <ArrowDown className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
