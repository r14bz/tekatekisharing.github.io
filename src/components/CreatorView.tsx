import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Share2,
  Play,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Home,
  Edit3,
  PaintBucket,
  RefreshCw,
  FileText,
  Tag,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CrosswordPuzzle, Direction, UserProfile, ClueItem } from '../types/tts';
import { generateCluesFromGrid, generatePuzzleId } from '../services/gridBuilder';
import { StorageService } from '../services/storageService';
import { CloudService } from '../services/cloudService';
import { SyncService } from '../services/syncService';
import { showToast as showAppToast } from './Toast';

interface CreatorViewProps {
  userProfile: UserProfile;
  initialPuzzle?: CrosswordPuzzle | null;
  onSaveAndPlay: (puzzle: CrosswordPuzzle) => void;
  onOpenShareModal: (puzzle: CrosswordPuzzle) => void;
  onOpenDrafts?: () => void;
  onBackToHome?: () => void;
  onOpenSyncModal?: () => void;
}

export const CreatorView: React.FC<CreatorViewProps> = ({
  userProfile,
  initialPuzzle,
  onSaveAndPlay,
  onOpenShareModal,
  onOpenDrafts,
  onBackToHome,
  onOpenSyncModal,
}) => {
  const [gridSize, setGridSize] = useState<number>(initialPuzzle ? initialPuzzle.width : 7);
  const [title, setTitle] = useState(initialPuzzle ? initialPuzzle.title : 'TTS Baru');
  const [authorName, setAuthorName] = useState(
    initialPuzzle ? initialPuzzle.authorName : userProfile.name
  );
  const [customCode, setCustomCode] = useState(
    initialPuzzle?.customCode || ''
  );
  const [description, setDescription] = useState(initialPuzzle?.description || '');

  // 2D matrix: null = black block, '' = empty white cell, 'A'..'Z' = letter
  const [grid, setGrid] = useState<(string | null)[][]>(() => {
    if (initialPuzzle) {
      return initialPuzzle.grid.map((row) => [...row]);
    }
    const size = 7;
    const initial = Array.from({ length: size }, () => Array(size).fill(''));
    // Make corners black as a neat classic crossword starter
    initial[0][0] = null;
    initial[0][size - 1] = null;
    initial[size - 1][0] = null;
    initial[size - 1][size - 1] = null;
    return initial;
  });

  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>({
    row: 0,
    col: 1,
  });
  const [activeDirection, setActiveDirection] = useState<Direction>('across');
  const [clueQuestions, setClueQuestions] = useState<Record<string, string>>(() => {
    if (initialPuzzle) {
      const map: Record<string, string> = {};
      initialPuzzle.clues.forEach((c) => {
        map[c.id] = c.question;
      });
      return map;
    }
    return {};
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [publishedSuccessPuzzle, setPublishedSuccessPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [savedDraftSuccess, setSavedDraftSuccess] = useState(false);

  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const activeCellRef = useRef<HTMLDivElement | null>(null);
  // When true, do NOT auto-scroll the grid (user is typing clue questions)
  const skipGridAutoScrollRef = useRef(false);

  // Keep active cell visible ABOVE the on-screen keyboard (disabled while editing soal)
  useEffect(() => {
    if (!activeCell) return;
    if (skipGridAutoScrollRef.current) return;

    const scrollActiveAboveKeyboard = () => {
      const el = activeCellRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const safeBottom = visibleBottom - 120;
      const safeTop = (vv ? vv.offsetTop : 0) + 80;
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
  }, [activeCell, activeDirection]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Re-generate clues whenever grid or clueQuestions change
  const existingMap = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(clueQuestions).forEach(([k, v]) => map.set(k, String(v || '')));
    return map;
  }, [clueQuestions]);

  const { clues, cellNumbers } = useMemo(
    () => generateCluesFromGrid(grid, existingMap),
    [grid, existingMap]
  );

  // Resize grid
  const handleResizeGrid = (newSize: number) => {
    setGridSize(newSize);
    setGrid((prev) => {
      const newGrid = Array.from({ length: newSize }, (_, r) =>
        Array.from({ length: newSize }, (_, c) => {
          if (prev[r] && prev[r][c] !== undefined) {
            return prev[r][c];
          }
          return '';
        })
      );
      return newGrid;
    });
    setActiveCell({ row: 0, col: 0 });
    showToast(`Ukuran kotak diubah ke ${newSize}x${newSize}`, 'info');
  };

  // Toggle cell between black block and white letter cell
  const handleToggleBlock = (r: number, c: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      if (next[r][c] === null) {
        next[r][c] = ''; // make white
      } else {
        next[r][c] = null; // make black block
      }
      return next;
    });
  };

  // Auto Black Out Empty Cells
  const handleAutoBlackoutEmpty = () => {
    let count = 0;
    const next = grid.map((row) =>
      row.map((cell) => {
        if (cell === '') {
          count++;
          return null;
        }
        return cell;
      })
    );

    if (count === 0) {
      showToast('Tidak ada kotak kosong yang perlu dihitamkan.', 'info');
      return;
    }

    setGrid(next);
    showToast(`✨ ${count} kotak kosong berhasil dihitamkan otomatis!`, 'success');
  };

  const handleUnblockAll = () => {
    let count = 0;
    const next = grid.map((row) =>
      row.map((cell) => {
        if (cell === null) {
          count++;
          return '';
        }
        return cell;
      })
    );
    if (count > 0) {
      setGrid(next);
      showToast(`${count} blok hitam dibuka menjadi kotak putih.`, 'info');
    }
  };

  const handleClearLettersOnly = () => {
    const next = grid.map((row) =>
      row.map((cell) => (cell === null ? null : ''))
    );
    setGrid(next);
    showToast('Semua huruf dalam kotak telah dikosongkan.', 'info');
  };

  const handleCellClick = (r: number, c: number) => {
    if (grid[r][c] === null) {
      handleToggleBlock(r, c);
      setActiveCell({ row: r, col: c });
    } else if (activeCell?.row === r && activeCell?.col === c) {
      setActiveDirection((d) => (d === 'across' ? 'down' : 'across'));
    } else {
      setActiveCell({ row: r, col: c });
    }

    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  const handleToggleDirection = () => {
    setActiveDirection((d) => (d === 'across' ? 'down' : 'across'));
    if (hiddenInputRef.current) hiddenInputRef.current.focus();
  };

  const handleInputChar = (char: string) => {
    if (!activeCell) return;
    const { row: r, col: c } = activeCell;
    if (grid[r][c] === null) return;

    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = char.toUpperCase();
      return next;
    });

    if (activeDirection === 'across') {
      let nextCol = c + 1;
      while (nextCol < gridSize && grid[r][nextCol] === null) {
        nextCol++;
      }
      if (nextCol < gridSize) {
        setActiveCell({ row: r, col: nextCol });
      }
    } else {
      let nextRow = r + 1;
      while (nextRow < gridSize && grid[nextRow][c] === null) {
        nextRow++;
      }
      if (nextRow < gridSize) {
        setActiveCell({ row: nextRow, col: c });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeCell) return;
    const { row: r, col: c } = activeCell;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (grid[r][c] !== '' && grid[r][c] !== null) {
        setGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = '';
          return next;
        });
      } else {
        if (activeDirection === 'across' && c > 0) {
          let prevCol = c - 1;
          while (prevCol >= 0 && grid[r][prevCol] === null) prevCol--;
          if (prevCol >= 0) setActiveCell({ row: r, col: prevCol });
        } else if (activeDirection === 'down' && r > 0) {
          let prevRow = r - 1;
          while (prevRow >= 0 && grid[prevRow][c] === null) prevRow--;
          if (prevRow >= 0) setActiveCell({ row: prevRow, col: c });
        }
      }
    } else if (e.key === 'ArrowRight' && c + 1 < gridSize) {
      setActiveCell({ row: r, col: c + 1 });
    } else if (e.key === 'ArrowLeft' && c - 1 >= 0) {
      setActiveCell({ row: r, col: c - 1 });
    } else if (e.key === 'ArrowDown' && r + 1 < gridSize) {
      setActiveCell({ row: r + 1, col: c });
    } else if (e.key === 'ArrowUp' && r - 1 >= 0) {
      setActiveCell({ row: r - 1, col: c });
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggleDirection();
    }
  };

  // Scroll ONLY the clue question input above the mobile keyboard (never jump to grid)
  const scrollInputAboveKeyboard = (el: HTMLElement | null) => {
    if (!el) return;
    skipGridAutoScrollRef.current = true;
    // Prefer scrolling the whole clue card so label + input stay visible
    const card = el.closest('[id^="clue-input-box-"]') as HTMLElement | null;
    const target = card || el;

    const doScroll = () => {
      const rect = target.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
      const safeBottom = visibleBottom - 160; // space above keyboard
      const safeTop = (vv ? vv.offsetTop : 0) + 72; // below sticky navbar
      if (rect.bottom > safeBottom) {
        window.scrollBy({ top: rect.bottom - safeBottom, behavior: 'smooth' });
      } else if (rect.top < safeTop) {
        window.scrollBy({ top: rect.top - safeTop, behavior: 'smooth' });
      }
    };

    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 120);
    setTimeout(doScroll, 320);
  };

  const handleClueInputBlur = () => {
    // Re-enable grid auto-scroll after leaving the question field
    setTimeout(() => {
      skipGridAutoScrollRef.current = false;
    }, 300);
  };

  const handleClueQuestionChange = (clueId: string, text: string) => {
    setClueQuestions((prev) => ({
      ...prev,
      [clueId]: text,
    }));
  };

  const handleSelectClue = (clue: ClueItem) => {
    // Highlight the word on the grid, but do NOT scroll the page to the grid
    skipGridAutoScrollRef.current = true;
    setActiveDirection(clue.direction);
    setActiveCell({ row: clue.row, col: clue.col });
    // Do not focus hidden grid input — user is editing the question list
  };

  const isCellInActiveCreatorWord = (r: number, c: number): boolean => {
    if (!activeCell) return false;
    const activeClue = clues.find((clue) => {
      if (clue.direction !== activeDirection) return false;
      if (activeDirection === 'across') {
        return clue.row === activeCell.row && activeCell.col >= clue.col && activeCell.col < clue.col + clue.length;
      } else {
        return clue.col === activeCell.col && activeCell.row >= clue.row && activeCell.row < clue.row + clue.length;
      }
    });

    if (!activeClue) {
      return activeDirection === 'across' ? r === activeCell.row : c === activeCell.col;
    }

    if (activeClue.direction === 'across') {
      return r === activeClue.row && c >= activeClue.col && c < activeClue.col + activeClue.length;
    } else {
      return c === activeClue.col && r >= activeClue.row && r < activeClue.row + activeClue.length;
    }
  };

  // Requirement #5 & #8: Save as Draft with popup modal and auto redirect to home
  const handleSaveDraft = () => {
    const finalClues = clues.map((clue) => ({
      ...clue,
      question: (clueQuestions[clue.id] || '').trim(),
    }));

    const cleanCode = customCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    const draftPuzzle: CrosswordPuzzle = {
      id: initialPuzzle?.id || generatePuzzleId(),
      title: title.trim() || 'Draf TTS Tanpa Judul',
      description: description.trim(),
      authorName: authorName.trim() || userProfile.name,
      authorId: userProfile.id,
      authorEmail: userProfile.email,
      customCode: cleanCode || undefined,
      isDraft: true,
      width: gridSize,
      height: gridSize,
      grid: grid.map((r) => [...r]),
      clues: finalClues,
      createdAt: initialPuzzle?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    StorageService.saveDraftPuzzle(draftPuzzle);
    setSavedDraftSuccess(true);

    // Auto-return to home/drafts after short timeout
    setTimeout(() => {
      if (onOpenDrafts) {
        onOpenDrafts();
      } else if (onBackToHome) {
        onBackToHome();
      }
    }, 2000);
  };

  // Build & Validate puzzle for publishing
  const validateAndBuildPuzzle = (): CrosswordPuzzle | null => {
    const errors: string[] = [];

    if (!title.trim()) {
      errors.push('Judul teka-teki silang harus diisi.');
    }
    if (!authorName.trim()) {
      errors.push('Nama pembuat harus diisi.');
    }

    if (clues.length === 0) {
      errors.push('Belum ada kata terhubung yang terbentuk di dalam kotak (minimal 2 huruf).');
    }

    // Check if any letter cell is empty
    let hasEmptyCell = false;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r][c] === '') {
          hasEmptyCell = true;
          break;
        }
      }
    }
    if (hasEmptyCell) {
      errors.push('Terdapat kotak putih yang masih kosong. Gunakan tombol "Hitamkan Blok Kosong Otomatis" atau isi hurufnya.');
    }

    // Check if all clues have questions
    const missingQuestions = clues.filter(
      (clue) => !clueQuestions[clue.id] || !clueQuestions[clue.id].trim()
    );
    if (missingQuestions.length > 0) {
      errors.push(
        `${missingQuestions.length} pertanyaan soal belum diisi (misal: soal nomor ${missingQuestions[0].number} ${missingQuestions[0].direction === 'across' ? 'Mendatar' : 'Menurun'}).`
      );
    }

    setValidationErrors(errors);

    if (errors.length > 0) {
      return null;
    }

    const finalClues = clues.map((clue) => ({
      ...clue,
      question: (clueQuestions[clue.id] || '').trim(),
    }));

    const cleanCode = customCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    const puzzle: CrosswordPuzzle = {
      id: initialPuzzle?.id || generatePuzzleId(),
      title: title.trim(),
      description: description.trim(),
      authorName: authorName.trim(),
      authorId: userProfile.id,
      authorEmail: userProfile.email,
      customCode: cleanCode || undefined,
      isDraft: false,
      width: gridSize,
      height: gridSize,
      grid: grid.map((r) => [...r]),
      clues: finalClues,
      createdAt: initialPuzzle?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    return puzzle;
  };

  // Requirement #6: Publish & save to cloud database, then show custom code (no direct link)
    const handlePublishAndSave = async () => {
    if (!userProfile.isLoggedIn) {
      showAppToast('Login terlebih dahulu untuk mempublikasikan TTS', 'auth', {
        actionLabel: 'Login',
        onAction: () => onOpenSyncModal?.(),
      });
      onOpenSyncModal?.();
      return;
    }
    const puzzle = validateAndBuildPuzzle();
    if (!puzzle) return;
    StorageService.saveMyPuzzle(puzzle);
    try {
      const res = await CloudService.publishPuzzle(puzzle);
      if (!res.success) {
        const msg = res.message || 'Gagal mempublikasikan ke cloud.';
        const needAuth = /login|akses ditolak|autentikasi/i.test(msg);
        showAppToast(msg, needAuth ? 'auth' : 'error', needAuth ? {
          actionLabel: 'Login',
          onAction: () => onOpenSyncModal?.(),
        } : undefined);
        if (needAuth) onOpenSyncModal?.();
        return;
      }
      await SyncService.syncToCloud();
      setPublishedSuccessPuzzle(puzzle);
      showToast('TTS berhasil dipublikasikan ke komunitas!', 'success');
    } catch (e) {
      console.warn('Sync failed after publish:', e);
      showAppToast('Gagal menghubungi server. TTS disimpan lokal.', 'warning');
      setPublishedSuccessPuzzle(puzzle);
    }
  };

  const handleTestPlay = async () => {
    if (!userProfile.isLoggedIn) {
      showAppToast('Login terlebih dahulu untuk memainkan TTS', 'auth', {
        actionLabel: 'Login',
        onAction: () => onOpenSyncModal?.(),
      });
      onOpenSyncModal?.();
      return;
    }
    const puzzle = validateAndBuildPuzzle();
    if (!puzzle) return;
    StorageService.saveMyPuzzle(puzzle);
    try {
      await CloudService.publishPuzzle(puzzle);
      await SyncService.syncToCloud();
    } catch (e) {
      console.warn('Sync failed after publish:', e);
    }
    onSaveAndPlay(puzzle);
  };

const acrossClues = clues.filter((c) => c.direction === 'across');
  const downClues = clues.filter((c) => c.direction === 'down');
  const isAcross = activeDirection === 'across';

  return (
    <div id="creator-view-container" className="w-full max-w-5xl mx-auto p-2.5 sm:p-5 pb-10 sm:pb-14">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              TTS Creator Pro
            </span>
            <span className="text-xs text-slate-500 font-medium">Buat & Rancang Teka-Teki Silang</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            {initialPuzzle?.isDraft ? 'Edit Draf Teka-Teki Silang' : initialPuzzle ? 'Edit Teka-Teki Silang' : 'Buat Teka-Teki Silang Baru'}
          </h2>
        </div>

        {/* Action: Return to Home, Drafts list link & Grid Size Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {onBackToHome && (
            <button
              type="button"
              id="btn-creator-back-home-top"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
              title="Kembali ke Halaman Awal / Pustaka"
            >
              <Home className="w-3.5 h-3.5 text-slate-600" />
              <span>Halaman Awal</span>
            </button>
          )}

          {onOpenDrafts && (
            <button
              type="button"
              id="btn-creator-open-drafts-top"
              onClick={onOpenDrafts}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-200"
            >
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Draf Tersimpan</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <span className="text-xs text-slate-600 px-2 font-bold">Ukuran:</span>
            {[5, 7, 9, 11].map((sz) => (
              <button
                key={sz}
                type="button"
                id={`btn-grid-size-${sz}`}
                onClick={() => handleResizeGrid(sz)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  gridSize === sz
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {sz}x{sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Meta Form: Title, Author, & Custom Code */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Judul Teka-Teki:
          </label>
          <input
            type="text"
            id="input-creator-puzzle-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Pesona Alam Nusantara..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-bold"
            maxLength={40}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Nama Pembuat (Author):
          </label>
          <input
            type="text"
            id="input-creator-author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Nama Anda..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-medium"
            maxLength={25}
          />
        </div>

        {/* Custom Code Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3 text-indigo-600" /> Kode Kustom (Opsional):
            </span>
            <span className="text-[10px] text-slate-400 font-normal">Contoh: TTS-KUIS</span>
          </label>
          <input
            type="text"
            id="input-creator-custom-code"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
            placeholder="KODE-KUSTOM-ANDA"
            className="w-full bg-indigo-50/40 border border-indigo-200 rounded-xl px-3.5 py-2 text-sm font-mono font-bold text-indigo-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 tracking-wider"
            maxLength={20}
          />
        </div>
      </div>

      {/* Grid Designer & Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Interactive Grid Matrix & Tools */}
        <div className="lg:col-span-6 flex flex-col items-center">
          {/* Quick Toolbar above grid */}
          <div className="w-full flex items-center justify-between gap-2 mb-2 px-1">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-600" />
              Matriks Kotak ({gridSize}x{gridSize})
            </span>

            {/* Direction Quick Switcher */}
            <button
              type="button"
              id="btn-creator-direction-toggle-top"
              onClick={handleToggleDirection}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 border border-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-indigo-500" />
              <span>Arah:</span>
              <span className="font-extrabold text-indigo-800">
                {isAcross ? 'Mendatar (➡️)' : 'Menurun (⬇️)'}
              </span>
            </button>
          </div>

          {/* Live Active Word & Letter Indicator Strip */}
          {activeCell && (
            <div
              id="creator-live-word-preview"
              className="w-full bg-indigo-50/90 border border-indigo-200/90 rounded-2xl p-2.5 mb-2.5 flex items-center justify-between gap-2 text-xs shadow-2xs animate-in fade-in"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-800 flex items-center gap-1">
                  {isAcross ? <ArrowRight className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />}
                  {isAcross ? 'Mendatar' : 'Menurun'}
                </span>
                <span className="text-slate-500 font-medium">
                  [Baris {activeCell.row + 1}, Kolom {activeCell.col + 1}]
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600 font-medium">Huruf:</span>
                <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-mono font-bold text-base flex items-center justify-center shadow-xs">
                  {grid[activeCell.row][activeCell.col] || (
                    <span className="animate-pulse opacity-70">|</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Grid Container */}
          <div
            id="creator-grid-matrix"
            className="grid gap-1 sm:gap-1.5 p-2.5 bg-slate-200 rounded-2xl border border-slate-300 shadow-inner w-full max-w-sm sm:max-w-md aspect-square select-none relative"
            style={{
              gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridSize}, minmax(0, 1fr))`,
            }}
          >
            {/* Persistent Input Element for Creator mode */}
            {activeCell && grid[activeCell.row][activeCell.col] !== null && (
              <input
                ref={hiddenInputRef}
                id="creator-persistent-native-input"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="absolute z-30 opacity-0 cursor-pointer caret-transparent p-0 m-0 border-0"
                style={{
                  top: `calc(${(activeCell.row / gridSize) * 100}% + 8px)`,
                  left: `calc(${(activeCell.col / gridSize) * 100}% + 8px)`,
                  width: `calc(${100 / gridSize}% - 10px)`,
                  height: `calc(${100 / gridSize}% - 10px)`,
                }}
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const char = val.slice(-1).toUpperCase();
                    if (/^[A-Z0-9]$/i.test(char)) {
                      handleInputChar(char);
                    }
                  }
                  e.target.value = '';
                }}
                onKeyDown={handleKeyDown}
                aria-label="Input Pembuat TTS"
              />
            )}

            {Array.from({ length: gridSize }).map((_, r) =>
              Array.from({ length: gridSize }).map((_, c) => {
                const isBlock = grid[r][c] === null;
                const isActive = activeCell?.row === r && activeCell?.col === c;
                const inActiveWord = isCellInActiveCreatorWord(r, c);
                const cellChar = grid[r][c] || '';
                const num = cellNumbers[r]?.[c];

                return (
                  <div
                    key={`c-cell-${r}-${c}`}
                    ref={isActive ? activeCellRef : null}
                    id={`creator-cell-${r}-${c}`}
                    onClick={() => {
                      handleCellClick(r, c);
                      if (hiddenInputRef.current) hiddenInputRef.current.focus();
                    }}
                    className={`w-full h-full rounded-md sm:rounded-lg relative flex items-center justify-center font-bold text-base sm:text-xl font-mono cursor-pointer transition-all duration-150 ${
                      isBlock
                        ? 'bg-slate-800 hover:bg-slate-700 border border-slate-800 text-slate-400 shadow-2xs'
                        : isActive
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 z-20 scale-[1.04] shadow-md'
                        : inActiveWord
                        ? 'bg-indigo-50 text-indigo-900 border-2 border-indigo-300'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {/* Clue Number */}
                    {num && !isBlock && (
                      <span
                        className={`absolute top-0.5 left-1 text-[9px] font-sans font-bold leading-none ${
                          isActive ? 'text-white/90' : 'text-slate-400'
                        }`}
                      >
                        {num}
                      </span>
                    )}

                    {/* Cell Content */}
                    {isBlock ? (
                      <span className="text-[10px] text-slate-500 opacity-60">✕</span>
                    ) : cellChar ? (
                      <motion.span
                        key={`c-char-${r}-${c}-${cellChar}`}
                        initial={{ scale: 1.25, opacity: 0.8 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.1 }}
                        className="leading-none"
                      >
                        {cellChar}
                      </motion.span>
                    ) : isActive ? (
                      <span className="inline-flex items-center justify-center">
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white animate-pulse shadow-sm ring-2 ring-white/60" />
                      </span>
                    ) : (
                      <span className="leading-none opacity-0">A</span>
                    )}

                    {/* Direction Arrow on Active Cell */}
                    {isActive && !isBlock && (
                      <div className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-indigo-700 text-white leading-none">
                        {isAcross ? (
                          <ArrowRight className="w-2.5 h-2.5" />
                        ) : (
                          <ArrowDown className="w-2.5 h-2.5" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Smart Tools Toolbar */}
          <div className="w-full mt-3 p-3 bg-white border border-slate-200 rounded-2xl flex flex-col gap-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                id="btn-creator-auto-blackout"
                onClick={handleAutoBlackoutEmpty}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                title="Menghitamkan semua kotak putih yang tidak memiliki huruf secara instan"
              >
                <PaintBucket className="w-3.5 h-3.5 text-amber-400" />
                <span>Hitamkan Blok Kosong Otomatis</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  id="btn-creator-unblock-all"
                  onClick={handleUnblockAll}
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold cursor-pointer"
                  title="Ubah semua blok hitam kembali menjadi kotak putih"
                >
                  Putihkan Blok
                </button>
                <button
                  type="button"
                  id="btn-creator-clear-letters"
                  onClick={handleClearLettersOnly}
                  className="px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold cursor-pointer"
                  title="Hapus semua huruf dalam kotak"
                >
                  Hapus Huruf
                </button>
              </div>
            </div>

            {/* Active Cell Info & Controls */}
            {activeCell && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="text-slate-600 font-medium">
                  Kotak: <span className="font-bold text-slate-900">[{activeCell.row + 1}, {activeCell.col + 1}]</span>
                  {' • '}
                  Status:{' '}
                  <span className="font-bold text-slate-900">
                    {grid[activeCell.row][activeCell.col] === null ? 'Blok Hitam' : 'Kotak Huruf'}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    id="btn-creator-toggle-block-action"
                    onClick={() => handleToggleBlock(activeCell.row, activeCell.col)}
                    className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold cursor-pointer"
                  >
                    {grid[activeCell.row][activeCell.col] === null ? 'Jadikan Huruf' : 'Jadikan Blok Hitam'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Clue Questions Editor */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 flex flex-col h-[540px] shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-indigo-600" />
              Daftar Soal Pertanyaan ({clues.length} Soal)
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Otomatis terdeteksi
            </span>
          </div>

          {clues.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <HelpCircle className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700 mb-1">
                Belum ada kata terdeteksi
              </p>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Ketik huruf berurutan di kotak kiri (minimal 2 huruf tersambung) untuk membuat kata mendatar atau menurun.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              {/* Mendatar (Across) */}
              {acrossClues.length > 0 && (
                <div>
                  <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-600" /> Mendatar ({acrossClues.length})
                  </h4>
                  <div className="space-y-2.5">
                    {acrossClues.map((clue) => (
                      <div
                        key={clue.id}
                        id={`clue-input-box-${clue.id}`}
                        onClick={() => handleSelectClue(clue)}
                        className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-indigo-300 rounded-2xl p-3 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-800">
                            {clue.number}. Jawaban:{' '}
                            <span className="font-mono text-indigo-700 font-black tracking-wider bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                              {clue.answer}
                            </span>{' '}
                            <span className="text-slate-500 font-normal">({clue.length} huruf)</span>
                          </span>
                          <span className="text-[10px] text-indigo-600 font-bold">Sorot Kotak</span>
                        </div>
                        <input
                          type="text"
                          id={`input-clue-question-${clue.id}`}
                          value={clueQuestions[clue.id] || ''}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
                          onBlur={handleClueInputBlur}
                          onChange={(e) => handleClueQuestionChange(clue.id, e.target.value)}
                          placeholder={`Tulis pertanyaan untuk kata "${clue.answer}"...`}
                          className="w-full bg-white border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Menurun (Down) */}
              {downClues.length > 0 && (
                <div>
                  <h4 className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ArrowDown className="w-3.5 h-3.5 text-emerald-600" /> Menurun ({downClues.length})
                  </h4>
                  <div className="space-y-2.5">
                    {downClues.map((clue) => (
                      <div
                        key={clue.id}
                        id={`clue-input-box-${clue.id}`}
                        onClick={() => handleSelectClue(clue)}
                        className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-emerald-300 rounded-2xl p-3 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-800">
                            {clue.number}. Jawaban:{' '}
                            <span className="font-mono text-emerald-700 font-black tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {clue.answer}
                            </span>{' '}
                            <span className="text-slate-500 font-normal">({clue.length} huruf)</span>
                          </span>
                          <span className="text-[10px] text-emerald-600 font-bold">Sorot Kotak</span>
                        </div>
                        <input
                          type="text"
                          id={`input-clue-question-${clue.id}`}
                          value={clueQuestions[clue.id] || ''}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={(e) => scrollInputAboveKeyboard(e.currentTarget)}
                          onBlur={handleClueInputBlur}
                          onChange={(e) => handleClueQuestionChange(clue.id, e.target.value)}
                          placeholder={`Tulis pertanyaan untuk kata "${clue.answer}"...`}
                          className="w-full bg-white border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Validation Errors alert */}
      {validationErrors.length > 0 && (
        <div
          id="creator-validation-alert"
          className="mt-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1 animate-in fade-in"
        >
          <div className="flex items-center gap-2 font-bold text-rose-800 text-sm mb-1">
            <AlertCircle className="w-4 h-4 text-rose-600" /> Belum Siap Dipublish:
          </div>
          {validationErrors.map((err, i) => (
            <p key={i} className="pl-6 font-medium">
              • {err}
            </p>
          ))}
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            id="creator-toast-notification"
            className={`mt-4 p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 shadow-sm ${
              notification.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-indigo-50 border-indigo-200 text-indigo-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Floating Action Bar: Return Home, Save Draft, Test Play, Publish */}
      <div className="mt-7 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBackToHome && (
            <button
              type="button"
              id="btn-creator-back-home-bottom"
              onClick={onBackToHome}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
              title="Kembali ke Halaman Awal"
            >
              <Home className="w-4 h-4 text-slate-600" />
              <span>Halaman Awal</span>
            </button>
          )}

          {/* Requirement #8: Save Draft Button */}
          <button
            type="button"
            id="btn-creator-save-draft"
            onClick={handleSaveDraft}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-300 transition-colors shadow-2xs cursor-pointer"
            title="Simpan progress pembuatan ke daftar draf tanpa validasi ketat"
          >
            <Save className="w-4 h-4 text-slate-600" />
            <span>Simpan Draf</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            id="btn-creator-test-play"
            onClick={handleTestPlay}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-2 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
          >
            <Play className="w-4 h-4 text-emerald-600" />
            <span>Coba Mainkan</span>
          </button>

          {/* Publish Button */}
          <button
            type="button"
            id="btn-creator-publish-puzzle"
            onClick={handlePublishAndSave}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Publish Teka-Teki</span>
          </button>
        </div>
      </div>

      {/* Requirement #6: Published Success Modal (Shows Custom Code clearly + Return to Home button) */}
      {publishedSuccessPuzzle && (
        <div
          id="modal-publish-success-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            id="modal-publish-success-card"
            className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-slate-800 mb-1">
              Teka-Teki Berhasil Di-Publish! 🎉
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Teka-teki silang <strong>"{publishedSuccessPuzzle.title}"</strong> kini dapat dimainkan oleh semua pengguna lain di tab Komunitas.
            </p>

            {/* Custom Code Box */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 mb-5 text-left">
              <span className="text-[11px] font-bold text-indigo-700 block mb-1">
                Kode Teka-Teki Silang Anda:
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-black text-indigo-950 tracking-wider">
                  {publishedSuccessPuzzle.customCode || publishedSuccessPuzzle.id}
                </span>
                <button
                  type="button"
                  id="btn-copy-published-code"
                  onClick={() => {
                    const code = publishedSuccessPuzzle.customCode || publishedSuccessPuzzle.id;
                    navigator.clipboard.writeText(code);
                    showToast('Kode berhasil disalin!', 'success');
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Salin Kode
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Berikan kode ini kepada teman Anda agar mereka dapat langsung bermain & bersaing di leaderboard!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                id="btn-play-now-after-publish"
                onClick={() => {
                  const p = publishedSuccessPuzzle;
                  setPublishedSuccessPuzzle(null);
                  onSaveAndPlay(p);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Mainkan Sekarang
              </button>

              <button
                type="button"
                id="btn-share-modal-after-publish"
                onClick={() => {
                  const p = publishedSuccessPuzzle;
                  setPublishedSuccessPuzzle(null);
                  onOpenShareModal(p);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Bagikan Kode
              </button>
            </div>

            {/* Requirement #2: Return to Home Button */}
            <button
              type="button"
              id="btn-return-home-after-publish"
              onClick={() => {
                setPublishedSuccessPuzzle(null);
                if (onBackToHome) {
                  onBackToHome();
                } else if (onOpenDrafts) {
                  onOpenDrafts();
                }
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200"
            >
              <Home className="w-4 h-4 text-slate-600" />
              <span>Kembali ke Halaman Awal</span>
            </button>
          </div>
        </div>
      )}

      {/* Requirement #5: Saved Draft Success Popup Notification Modal */}
      {savedDraftSuccess && (
        <div
          id="modal-draft-success-backdrop"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            id="modal-draft-success-card"
            className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 text-center animate-in zoom-in-95"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-black text-slate-800 mb-1">
              TTS Berhasil Disimpan ke Draft! 📝
            </h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Teka-teki silang Anda telah tersimpan rapi di daftar draf. Mengalihkan kembali ke Halaman Awal...
            </p>

            <button
              type="button"
              id="btn-confirm-draft-return-home"
              onClick={() => {
                setSavedDraftSuccess(false);
                if (onOpenDrafts) {
                  onOpenDrafts();
                } else if (onBackToHome) {
                  onBackToHome();
                }
              }}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Home className="w-4 h-4" />
              <span>Kembali ke Halaman Awal</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
