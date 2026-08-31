import { ClueItem, CrosswordPuzzle } from '../types/tts';

/**
 * Normalisasi clue id lama (`across-<nomor>-<r>-<c>`, memuat nomor urut
 * yang bisa berubah tiap grid diedit) ke format baru berbasis posisi saja
 * (`across-<r>-<c>`). Dipakai supaya soal yang sudah tersimpan di puzzle
 * lama tetap cocok (tidak hilang) walau formatnya beda dari yang baru
 * dihasilkan sekarang.
 */
function normalizeClueKey(key: string): string {
  const legacyMatch = key.match(/^(across|down)-\d+-(\d+)-(\d+)$/);
  if (legacyMatch) {
    return `${legacyMatch[1]}-${legacyMatch[2]}-${legacyMatch[3]}`;
  }
  return key;
}

/**
 * Analyzes a 2D grid matrix of letters (or null for black blocks)
 * and generates all across and down clues with appropriate numbers.
 */
export function generateCluesFromGrid(
  grid: (string | null)[][],
  existingCluesMap: Map<string, string> = new Map()
): { clues: ClueItem[]; cellNumbers: (number | null)[][] } {
  const height = grid.length;
  if (height === 0) return { clues: [], cellNumbers: [] };
  const width = grid[0].length;

  // Terima key format lama maupun baru dari caller.
  const normalizedExistingMap = new Map<string, string>();
  existingCluesMap.forEach((value, key) => {
    normalizedExistingMap.set(normalizeClueKey(key), value);
  });

  const cellNumbers: (number | null)[][] = Array.from({ length: height }, () =>
    Array(width).fill(null)
  );
  const clues: ClueItem[] = [];
  let currentNumber = 1;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === null || grid[r][c] === '') continue;

      const isStartOfAcross =
        (c === 0 || grid[r][c - 1] === null || grid[r][c - 1] === '') &&
        c + 1 < width &&
        grid[r][c + 1] !== null &&
        grid[r][c + 1] !== '';

      const isStartOfDown =
        (r === 0 || grid[r - 1][c] === null || grid[r - 1][c] === '') &&
        r + 1 < height &&
        grid[r + 1][c] !== null &&
        grid[r + 1][c] !== '';

      let assignedNum: number | null = null;

      if (isStartOfAcross || isStartOfDown) {
        assignedNum = currentNumber++;
        cellNumbers[r][c] = assignedNum;
      }

      if (isStartOfAcross) {
        // Collect across answer
        let len = 0;
        let ans = '';
        while (c + len < width && grid[r][c + len] !== null && grid[r][c + len] !== '') {
          ans += grid[r][c + len];
          len++;
        }
        // PENTING: id HANYA berbasis posisi (r,c), TIDAK menyertakan nomor
        // urut. Sebelumnya id memakai `across-${assignedNum}-${r}-${c}` —
        // begitu grid diedit (misal tambah blok hitam di baris sebelumnya)
        // nomor urut clue di posisi ini bisa berubah, sehingga id berubah
        // dan soal yang sudah diketik user untuk posisi itu hilang karena
        // existingCluesMap.get(clueKey) tidak lagi menemukan entri lama.
        const clueKey = `across-${r}-${c}`;
        clues.push({
          id: clueKey,
          number: assignedNum!,
          direction: 'across',
          row: r,
          col: c,
          length: len,
          answer: ans.toUpperCase(),
          question: normalizedExistingMap.get(clueKey) || '',
        });
      }

      if (isStartOfDown) {
        // Collect down answer
        let len = 0;
        let ans = '';
        while (r + len < height && grid[r + len][c] !== null && grid[r + len][c] !== '') {
          ans += grid[r + len][c];
          len++;
        }
        // Sama seperti across: id berbasis posisi saja, bukan nomor urut.
        const clueKey = `down-${r}-${c}`;
        clues.push({
          id: clueKey,
          number: assignedNum!,
          direction: 'down',
          row: r,
          col: c,
          length: len,
          answer: ans.toUpperCase(),
          question: normalizedExistingMap.get(clueKey) || '',
        });
      }
    }
  }

  return { clues, cellNumbers };
}

/**
 * Creates an empty grid with given dimensions.
 */
export function createEmptyGrid(width: number, height: number): (string | null)[][] {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

/**
 * Formats time in milliseconds to readable mm:ss.ms
 */
export function formatTime(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);

  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');

  return `${minStr}:${secStr}.${tenths}`;
}

export function formatTimeShort(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minStr = String(minutes).padStart(2, '0');
  const secStr = String(seconds).padStart(2, '0');
  return `${minStr}:${secStr}`;
}

/**
 * Generates a unique puzzle ID
 */
export function generatePuzzleId(): string {
  return 'tts_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * Calculates game score based on duration and grid size.
 * Fast completion yields substantially higher score points and bonus.
 */
export function calculateScore(timeMs: number, cellsCount: number = 25): number {
  if (timeMs <= 0) return 0;
  const seconds = Math.max(1, Math.floor(timeMs / 1000));
  const basePoints = Math.max(1500, cellsCount * 120);
  // High-speed bonus: faster finish = dramatically higher points
  const speedBonus = Math.max(100, Math.round(180000 / (seconds + 20)));
  const finalScore = basePoints + speedBonus;
  return Math.max(250, finalScore);
}

/**
 * Returns a human-friendly speed category badge label & icon
 */
export function getSpeedCategory(timeMs: number): { label: string; icon: string; color: string; bg: string } {
  const seconds = Math.floor(timeMs / 1000);
  if (seconds < 45) {
    return { label: 'Kilat Super ⚡', icon: '⚡', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' };
  }
  if (seconds < 90) {
    return { label: 'Sangat Cepat 🚀', icon: '🚀', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800' };
  }
  if (seconds < 180) {
    return { label: 'Cepat & Tepat ⭐', icon: '⭐', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' };
  }
  if (seconds < 360) {
    return { label: 'Fokus & Teliti 🎯', icon: '🎯', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800' };
  }
  return { label: 'Tuntas & Hebat 🏆', icon: '🏆', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700' };
}
