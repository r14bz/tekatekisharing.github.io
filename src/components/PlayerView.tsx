import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  RotateCcw,
  Share2,
  Trophy,
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  CrosswordPuzzle,
  Direction,
  ClueItem,
  PuzzleProgress,
  UserProfile,
} from '../types/tts';
import { TopClueBanner } from './TopClueBanner';
import { CrosswordGrid } from './CrosswordGrid';
import { WinModal } from './WinModal';
import { generateCluesFromGrid, formatTime } from '../services/gridBuilder';
import { StorageService } from '../services/storageService';

interface PlayerViewProps {
  puzzle: CrosswordPuzzle;
  userProfile: UserProfile;
  onBack: () => void;
  onOpenShareModal: (puzzle: CrosswordPuzzle) => void;
  onOpenLeaderboard: (puzzle: CrosswordPuzzle) => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  puzzle,
  userProfile,
  onBack,
  onOpenShareModal,
  onOpenLeaderboard,
}) => {
  const rows = puzzle.height;
  const cols = puzzle.width;

  // Derive clues and numbering
  const { clues, cellNumbers } = useMemo(
    () => generateCluesFromGrid(puzzle.grid),
    [puzzle.grid]
  );

  // Restore saved progress if any
  const savedProgress = StorageService.getProgress(puzzle.id);

  const [userGrid, setUserGrid] = useState<string[][]>(() => {
    if (
      savedProgress &&
      savedProgress.userGrid &&
      savedProgress.userGrid.length === rows
    ) {
      return savedProgress.userGrid;
    }
    return Array.from({ length: rows }, () => Array(cols).fill(''));
  });

  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(() => {
    // Find first valid non-black cell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (puzzle.grid[r][c] !== null && puzzle.grid[r][c] !== '') {
          return { row: r, col: c };
        }
      }
    }
    return null;
  });

  const [activeDirection, setActiveDirection] = useState<Direction>('across');
  const [timeSpentMs, setTimeSpentMs] = useState<number>(
    savedProgress ? savedProgress.timeSpentMs : 0
  );
  const [isCompleted, setIsCompleted] = useState<boolean>(
    savedProgress ? savedProgress.isCompleted : false
  );
  const [showWinModal, setShowWinModal] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const skipAutosaveRef = React.useRef(false);

  // Check Answer Feedback state
  const [checkFeedback, setCheckFeedback] = useState<{
    show: boolean;
    mistakes: { row: number; col: number }[];
    corrects: { row: number; col: number }[];
    message: string;
    type: 'success' | 'warning' | 'info';
  } | null>(null);

  // Continuous Stopwatch Timer with 1-second interval to avoid unnecessary rapid re-renders
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!isCompleted) {
      interval = setInterval(() => {
        setTimeSpentMs((prev) => prev + 1000);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCompleted]);

  // Debounced Auto-Save progress to storage to prevent disk/network spam
  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }
    const saveTimer = setTimeout(() => {
      const progress: PuzzleProgress = {
        puzzleId: puzzle.id,
        userGrid,
        isCompleted,
        timeSpentMs,
        lastPlayedAt: Date.now(),
        completedAt: isCompleted ? Date.now() : undefined,
      };
      StorageService.saveProgress(progress);
    }, 400);

    return () => clearTimeout(saveTimer);
  }, [userGrid, isCompleted, puzzle.id, timeSpentMs]);

  // Find active clue based on activeCell and activeDirection
  const getActiveClue = useCallback((): ClueItem | null => {
    if (!activeCell) return null;
    const { row: r, col: c } = activeCell;

    // 1. Exact match with activeDirection
    let match = puzzle.clues.find((clue) => {
      if (clue.direction !== activeDirection) return false;
      if (activeDirection === 'across') {
        return clue.row === r && c >= clue.col && c < clue.col + clue.length;
      } else {
        return clue.col === c && r >= clue.row && r < clue.row + clue.length;
      }
    });

    // 2. If no match in current direction, check if cell belongs to another direction
    if (!match) {
      const otherDir: Direction = activeDirection === 'across' ? 'down' : 'across';
      match = puzzle.clues.find((clue) => {
        if (clue.direction !== otherDir) return false;
        if (otherDir === 'across') {
          return clue.row === r && c >= clue.col && c < clue.col + clue.length;
        } else {
          return clue.col === c && r >= clue.row && r < clue.row + clue.length;
        }
      });
      if (match) {
        // Automatically align activeDirection to the available clue
        setActiveDirection(otherDir);
      }
    }

    return match || null;
  }, [activeCell, activeDirection, puzzle.clues]);

  const activeClue = getActiveClue();

  // Check if current active clue word is completely filled
  const isCurrentWordCompleted = useMemo(() => {
    if (!activeClue) return false;
    const { row, col, length, direction } = activeClue;
    for (let i = 0; i < length; i++) {
      const r = direction === 'across' ? row : row + i;
      const c = direction === 'across' ? col + i : col;
      if (!userGrid[r]?.[c] || userGrid[r][c].trim() === '') {
        return false;
      }
    }
    return true;
  }, [activeClue, userGrid]);

  // Calculate overall fill progress (% of non-black cells filled)
  const { totalCells, filledCells, progressPercent } = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (puzzle.grid[r][c] !== null && puzzle.grid[r][c] !== '') {
          total++;
          if (userGrid[r]?.[c] && userGrid[r][c].trim() !== '') {
            filled++;
          }
        }
      }
    }
    const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { totalCells: total, filledCells: filled, progressPercent: percent };
  }, [puzzle.grid, userGrid, rows, cols]);

  // Toggle direction between Mendatar and Menurun
  const handleToggleDirection = () => {
    setActiveDirection((d) => (d === 'across' ? 'down' : 'across'));
  };

  // Navigate to Next / Previous Clue
  const handleNextClue = () => {
    if (!puzzle.clues.length) return;
    const currentIndex = activeClue
      ? puzzle.clues.findIndex((c) => c.id === activeClue.id)
      : -1;
    const nextIndex = (currentIndex + 1) % puzzle.clues.length;
    const next = puzzle.clues[nextIndex];
    if (next) {
      setActiveDirection(next.direction);
      setActiveCell({ row: next.row, col: next.col });
    }
  };

  const handlePrevClue = () => {
    if (!puzzle.clues.length) return;
    const currentIndex = activeClue
      ? puzzle.clues.findIndex((c) => c.id === activeClue.id)
      : 0;
    const prevIndex = (currentIndex - 1 + puzzle.clues.length) % puzzle.clues.length;
    const prev = puzzle.clues[prevIndex];
    if (prev) {
      setActiveDirection(prev.direction);
      setActiveCell({ row: prev.row, col: prev.col });
    }
  };

  // Check victory condition
  const checkCompletion = (currentGrid: string[][]) => {
    let allFilled = true;
    let allCorrect = true;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const solutionChar = puzzle.grid[r][c];
        if (solutionChar !== null && solutionChar !== '') {
          const userChar = currentGrid[r]?.[c] || '';
          if (!userChar) {
            allFilled = false;
          } else if (userChar.toUpperCase() !== solutionChar.toUpperCase()) {
            allCorrect = false;
          }
        }
      }
    }

    if (allFilled && allCorrect) {
      setIsCompleted(true);
      setShowWinModal(true);
    }
  };

  // "Periksa Jawaban" (Check Answers) Logic
  const handleCheckAnswers = () => {
    const mistakes: { row: number; col: number }[] = [];
    const corrects: { row: number; col: number }[] = [];
    let filledCount = 0;
    let totalNonEmpty = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const solution = puzzle.grid[r][c];
        if (solution !== null && solution !== '') {
          totalNonEmpty++;
          const typed = userGrid[r]?.[c];
          if (typed && typed.trim() !== '') {
            filledCount++;
            if (typed.toUpperCase() === solution.toUpperCase()) {
              corrects.push({ row: r, col: c });
            } else {
              mistakes.push({ row: r, col: c });
            }
          }
        }
      }
    }

    if (filledCount === 0) {
      setCheckFeedback({
        show: true,
        mistakes: [],
        corrects: [],
        message: 'Belum ada kotak yang diisi. Ketuk salah satu kotak untuk mulai!',
        type: 'info',
      });
    } else if (mistakes.length === 0 && filledCount === totalNonEmpty) {
      setCheckFeedback({
        show: true,
        mistakes: [],
        corrects,
        message: 'Luar biasa! Semua jawaban benar 100%!',
        type: 'success',
      });
      setIsCompleted(true);
      setShowWinModal(true);
    } else if (mistakes.length === 0) {
      setCheckFeedback({
        show: true,
        mistakes: [],
        corrects,
        message: `Bagus! ${corrects.length} huruf yang sudah diisi semuanya tepat. Lanjutkan!`,
        type: 'success',
      });
    } else {
      setCheckFeedback({
        show: true,
        mistakes,
        corrects,
        message: `Ada ${mistakes.length} huruf yang belum tepat (kotak berbingkai merah).`,
        type: 'warning',
      });
    }

    // Auto dismiss check highlights after 4 seconds
    setTimeout(() => {
      setCheckFeedback((prev) => (prev ? { ...prev, show: false } : null));
    }, 4000);
  };

  // Cell selection with auto-detection prioritizing unfilled cells
  const handleCellClick = (r: number, c: number) => {
    if (puzzle.grid[r][c] === null || puzzle.grid[r][c] === '') return;

    if (activeCell?.row === r && activeCell?.col === c) {
      // Toggle direction if tapping active cell again or double-clicking
      handleToggleDirection();
      return;
    }

    // Auto-detect direction prioritizing clues that still have empty cells
    const acrossClue = puzzle.clues.find(
      (clue) =>
        clue.direction === 'across' &&
        clue.row === r &&
        c >= clue.col &&
        c < clue.col + clue.length
    );
    const downClue = puzzle.clues.find(
      (clue) =>
        clue.direction === 'down' &&
        clue.col === c &&
        r >= clue.row &&
        r < clue.row + clue.length
    );

    if (acrossClue && !downClue) {
      setActiveDirection('across');
    } else if (downClue && !acrossClue) {
      setActiveDirection('down');
    } else if (acrossClue && downClue) {
      // Count empty cells in across word
      let acrossEmpty = 0;
      for (let i = 0; i < acrossClue.length; i++) {
        const colIdx = acrossClue.col + i;
        if (!userGrid[r]?.[colIdx] || userGrid[r][colIdx].trim() === '') {
          acrossEmpty++;
        }
      }

      // Count empty cells in down word
      let downEmpty = 0;
      for (let i = 0; i < downClue.length; i++) {
        const rowIdx = downClue.row + i;
        if (!userGrid[rowIdx]?.[c] || userGrid[rowIdx][c].trim() === '') {
          downEmpty++;
        }
      }

      // Prioritize direction that still has empty/unfilled cells
      if (acrossEmpty > 0 && downEmpty === 0) {
        setActiveDirection('across');
      } else if (downEmpty > 0 && acrossEmpty === 0) {
        setActiveDirection('down');
      } else if (activeDirection === 'across' && acrossEmpty > 0) {
        setActiveDirection('across');
      } else if (activeDirection === 'down' && downEmpty > 0) {
        setActiveDirection('down');
      } else if (acrossEmpty >= downEmpty) {
        setActiveDirection('across');
      } else {
        setActiveDirection('down');
      }
    }

    setActiveCell({ row: r, col: c });
  };

  // Character Input (from Native Keyboard)
  const handleInputChange = (char: string) => {
    if (!activeCell || isCompleted) return;
    const { row: r, col: c } = activeCell;
    const upper = char.toUpperCase();

    // Clear feedback if user starts typing
    if (checkFeedback?.show) {
      setCheckFeedback(null);
    }

    // Update grid state
    const nextGrid = userGrid.map((row) => [...row]);
    nextGrid[r][c] = upper;
    setUserGrid(nextGrid);

    // Helper: next empty cell in the current word (skip already filled)
    const findNextEmptyInWord = (
      startRow: number,
      startCol: number,
      direction: 'across' | 'down'
    ): { row: number; col: number } | null => {
      if (direction === 'across') {
        for (let col = startCol + 1; col < cols; col++) {
          const sol = puzzle.grid[startRow][col];
          if (sol === null || sol === '') break; // end of word
          if (!nextGrid[startRow][col] || nextGrid[startRow][col].trim() === '') {
            return { row: startRow, col };
          }
        }
      } else {
        for (let row = startRow + 1; row < rows; row++) {
          const sol = puzzle.grid[row][startCol];
          if (sol === null || sol === '') break;
          if (!nextGrid[row][startCol] || nextGrid[row][startCol].trim() === '') {
            return { row, col: startCol };
          }
        }
      }
      return null;
    };

    // 1) Continue in the same word
    const nextInWord = findNextEmptyInWord(r, c, activeDirection);
    if (nextInWord) {
      setActiveCell(nextInWord);
      checkCompletion(nextGrid);
      return;
    }

    // 2) Word is full → jump to next incomplete clue (direction changes automatically)
    const clues = puzzle.clues || [];
    const currentIdx = activeClue
      ? clues.findIndex((cl) => cl.id === activeClue.id)
      : -1;

    const isClueIncomplete = (clue: (typeof clues)[0]) => {
      for (let i = 0; i < clue.length; i++) {
        const rr = clue.direction === 'across' ? clue.row : clue.row + i;
        const cc = clue.direction === 'across' ? clue.col + i : clue.col;
        if (!nextGrid[rr]?.[cc] || nextGrid[rr][cc].trim() === '') return true;
      }
      return false;
    };

    for (let offset = 1; offset <= clues.length; offset++) {
      const idx = (Math.max(currentIdx, 0) + offset) % clues.length;
      const clue = clues[idx];
      if (!clue || !isClueIncomplete(clue)) continue;

      for (let i = 0; i < clue.length; i++) {
        const rr = clue.direction === 'across' ? clue.row : clue.row + i;
        const cc = clue.direction === 'across' ? clue.col + i : clue.col;
        if (!nextGrid[rr]?.[cc] || nextGrid[rr][cc].trim() === '') {
          setActiveDirection(clue.direction);
          setActiveCell({ row: rr, col: cc });
          break;
        }
      }
      break;
    }

    checkCompletion(nextGrid);
  };

  // Key Down Handler (Backspace, Arrows, Space, Tab)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeCell || isCompleted) return;
    const { row: r, col: c } = activeCell;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevClue();
      } else {
        handleNextClue();
      }
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      const currentVal = userGrid[r]?.[c];
      const nextGrid = userGrid.map((row) => [...row]);

      if (currentVal && currentVal !== '') {
        // Clear current cell
        nextGrid[r][c] = '';
        setUserGrid(nextGrid);
      } else {
        // Step backwards to previous cell and clear it
        if (activeDirection === 'across' && c > 0) {
          let prevCol = c - 1;
          while (
            prevCol >= 0 &&
            (puzzle.grid[r][prevCol] === null || puzzle.grid[r][prevCol] === '')
          ) {
            prevCol--;
          }
          if (prevCol >= 0) {
            nextGrid[r][prevCol] = '';
            setUserGrid(nextGrid);
            setActiveCell({ row: r, col: prevCol });
          }
        } else if (activeDirection === 'down' && r > 0) {
          let prevRow = r - 1;
          while (
            prevRow >= 0 &&
            (puzzle.grid[prevRow][c] === null || puzzle.grid[prevRow][c] === '')
          ) {
            prevRow--;
          }
          if (prevRow >= 0) {
            nextGrid[prevRow][c] = '';
            setUserGrid(nextGrid);
            setActiveCell({ row: prevRow, col: c });
          }
        }
      }
    } else if (e.key === 'ArrowRight' && c + 1 < cols) {
      if (puzzle.grid[r][c + 1] !== null && puzzle.grid[r][c + 1] !== '') {
        setActiveCell({ row: r, col: c + 1 });
      }
    } else if (e.key === 'ArrowLeft' && c - 1 >= 0) {
      if (puzzle.grid[r][c - 1] !== null && puzzle.grid[r][c - 1] !== '') {
        setActiveCell({ row: r, col: c - 1 });
      }
    } else if (e.key === 'ArrowDown' && r + 1 < rows) {
      if (puzzle.grid[r + 1][c] !== null && puzzle.grid[r + 1][c] !== '') {
        setActiveCell({ row: r + 1, col: c });
      }
    } else if (e.key === 'ArrowUp' && r - 1 >= 0) {
      if (puzzle.grid[r - 1][c] !== null && puzzle.grid[r - 1][c] !== '') {
        setActiveCell({ row: r - 1, col: c });
      }
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggleDirection();
    }
  };

  const handleRestart = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    const empty = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '')
    );

    // Cegah autosave lama menimpa grid kosong
    skipAutosaveRef.current = true;

    setUserGrid(empty);
    setTimeSpentMs(0);
    setIsCompleted(false);
    setShowWinModal(false);
    setShowResetConfirm(false);
    setCheckFeedback(null);

    StorageService.deleteProgress(puzzle.id);
    StorageService.saveProgress({
      puzzleId: puzzle.id,
      userGrid: empty,
      isCompleted: false,
      timeSpentMs: 0,
      lastPlayedAt: Date.now(),
    });

    // Reset active cell to first valid cell
    outer: for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (puzzle.grid[r][c] !== null && puzzle.grid[r][c] !== '') {
          setActiveCell({ row: r, col: c });
          break outer;
        }
      }
    }
  };

  return (
    <div
      id="player-view-container"
      className="w-full max-w-lg mx-auto px-2 py-2 sm:py-3 pb-8 sm:pb-12 flex flex-col items-center"
    >
      {/* Top Navigation & Status Bar - Clean Header with continuous timer (no pause button) */}
      <div className="w-full flex items-center justify-between gap-1.5 mb-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
        <button
          type="button"
          id="btn-player-back"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Pustaka</span>
        </button>

        {/* Puzzle Title & Progress */}
        <div className="text-center truncate px-1 flex flex-col items-center">
          <h2 className="text-xs font-bold text-slate-800 truncate max-w-[140px] sm:max-w-[210px]">
            {puzzle.title}
          </h2>
          <span className="text-[9px] text-slate-500 font-medium">
            {filledCells}/{totalCells} Huruf ({progressPercent}%)
          </span>
        </div>

        {/* Live Timer Stopwatch (Continuous, pause button removed) */}
        <div className="flex items-center gap-1 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-mono text-xs font-bold text-indigo-950 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
          <span>{formatTime(timeSpentMs)}</span>
        </div>
      </div>

      {/* Progress Bar Line */}
      <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mb-2">
        <div
          className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Clue Question Banner on TOP */}
      <div className="w-full mb-2">
        <TopClueBanner
          activeClue={activeClue}
          onToggleDirection={handleToggleDirection}
          onPrevClue={handlePrevClue}
          onNextClue={handleNextClue}
          isWordCompleted={isCurrentWordCompleted}
        />
      </div>

      {/* Check Answer Feedback Toast Banner */}
      {checkFeedback && checkFeedback.show && (
        <div
          id="check-answers-feedback-banner"
          className={`w-full mb-2 p-2.5 rounded-xl border flex items-center gap-2 text-xs font-medium transition-all animate-in fade-in slide-in-from-top-1 shadow-xs ${
            checkFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : checkFeedback.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}
        >
          {checkFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : checkFeedback.type === 'warning' ? (
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          ) : (
            <CheckCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          )}
          <span className="flex-1">{checkFeedback.message}</span>
        </div>
      )}

      {/* Crossword Grid Matrix */}
      <CrosswordGrid
        puzzle={puzzle}
        userGrid={userGrid}
        activeCell={activeCell}
        activeDirection={activeDirection}
        activeClue={activeClue}
        cellNumbers={cellNumbers}
        onCellClick={handleCellClick}
        onInputChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onToggleDirection={handleToggleDirection}
        checkedFeedback={checkFeedback}
      />

      {/* Footer Action Buttons: Reset, Check Answers, Leaderboard, Share */}
      <div className="w-full flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-slate-200">
        {/* Left Side: Reset & Check Answers */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            id="btn-player-reset"
            onClick={handleRestart}
            className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 transition-colors font-medium cursor-pointer"
            title="Kosongkan seluruh isian dan mulai ulang waktu"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>

          {/* New "Periksa Jawaban" button right next to Reset */}
          <button
            type="button"
            id="btn-player-check-answers"
            onClick={handleCheckAnswers}
            className="flex items-center gap-1 text-[11px] text-indigo-700 hover:text-indigo-900 font-bold px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer shadow-2xs"
            title="Periksa huruf yang sudah diisi apakah sudah benar atau ada kesalahan"
          >
            <CheckCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Periksa Jawaban</span>
          </button>
        </div>

        {/* Right Side: Leaderboard & Share */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            id="btn-player-leaderboard"
            onClick={() => onOpenLeaderboard(puzzle)}
            className="flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-900 font-bold px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
          >
            <Trophy className="w-3 h-3 text-amber-600" />
            <span className="hidden xs:inline">Peringkat</span>
          </button>

          <button
            type="button"
            id="btn-player-share"
            onClick={() => onOpenShareModal(puzzle)}
            className="flex items-center gap-1 text-[11px] text-white font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 shadow-2xs transition-all cursor-pointer"
          >
            <Share2 className="w-3 h-3" />
            <span>Bagikan</span>
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div
          id="modal-reset-confirm-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            id="modal-reset-confirm-card"
            className="w-full max-w-xs sm:max-w-sm bg-white rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <RotateCcw className="w-6 h-6" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-800 mb-1">
              Mulai Ulang Teka-Teki?
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Semua kotak huruf yang sudah Anda isi akan dikosongkan dan waktu pengerjaan akan diatur ulang dari 0.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="btn-cancel-reset"
                onClick={() => setShowResetConfirm(false)}
                className="w-full py-2 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                id="btn-confirm-reset"
                onClick={handleConfirmReset}
                className="w-full py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Ya, Mulai Ulang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Victory Win Modal */}
      <WinModal
        isOpen={showWinModal}
        puzzle={puzzle}
        timeSpentMs={timeSpentMs}
        userProfile={userProfile}
        onClose={() => setShowWinModal(false)}
        onRestart={() => {
          setShowWinModal(false);
          handleConfirmReset();
        }}
        onOpenLeaderboard={() => {
          setShowWinModal(false);
          onOpenLeaderboard(puzzle);
        }}
        onHome={() => {
          setShowWinModal(false);
          onBack();
        }}
      />
    </div>
  );
};
