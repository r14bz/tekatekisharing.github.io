export type Direction = 'across' | 'down';

export interface ClueItem {
  id: string;
  number: number;
  direction: Direction;
  row: number;
  col: number;
  length: number;
  question: string;
  answer: string;
}

export interface CellData {
  row: number;
  col: number;
  isBlock: boolean;
  char?: string; // Correct uppercase letter (if not block)
  number?: number; // Clue start number if any
  acrossClueId?: string;
  downClueId?: string;
}

export type PuzzleReactionType = 'like' | 'laugh' | 'love' | 'think' | 'fire' | 'sad';

export interface PuzzleReactions {
  like: number;   // 👍 Suka / Bagus
  laugh: number;  // 😂 Lucu / Menghibur
  love: number;   // ❤️ Suka Banget
  think: number;  // 🤔 Menantang / Mikir Keras
  fire: number;   // 🔥 Keren / Seru
  sad: number;    // 😢 Sulit Banget
}

export interface PuzzleComment {
  id: string;
  puzzleId: string;
  authorName: string;
  authorAvatar: string;
  authorId?: string;
  authorEmail?: string;
  content: string;
  createdAt: number;
}

export interface CrosswordPuzzle {
  id: string;
  title: string;
  description?: string;
  authorName: string;
  authorAvatar?: string;
  authorId?: string;
  authorEmail?: string;
  width: number;
  height: number;
  grid: (string | null)[][]; // null = black cell, 'A'..'Z' = answer letter
  clues: ClueItem[];
  createdAt: number;
  updatedAt?: number;
  shareCode?: string;
  customCode?: string; // User-defined custom code identifier
  isDraft?: boolean; // True if saved as draft, False/undefined if published
  isFeatured?: boolean; // Editor's Pick / Featured by Admin
  isBanned?: boolean;
  difficulty?: 'Mudah' | 'Sedang' | 'Sulit';
  category?: string;
  playsCount?: number;
  completionsCount?: number;
  reactions?: PuzzleReactions;
  comments?: PuzzleComment[];
}

export interface PuzzleProgress {
  puzzleId: string;
  userGrid: string[][]; // User filled characters, '' for empty
  isCompleted: boolean;
  completedAt?: number;
  timeSpentMs: number;
  lastPlayedAt: number;
  mistakesCount?: number;
}

export interface LeaderboardEntry {
  id: string;
  puzzleId: string;
  puzzleTitle: string;
  playerName: string;
  playerAvatar: string;
  playerId?: string;
  playerEmail?: string;
  timeMs: number;
  score?: number; // Calculated score based on completion time & puzzle size
  completedAt: number;
  deviceInfo?: string;
  mistakesCount?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  syncKey: string;
  email?: string;
  isLoggedIn?: boolean;
  isBanned?: boolean;
  role?: 'admin' | 'user';
  provider?: 'google' | 'email' | 'guest';
  photoUrl?: string;
  authToken?: string;
  googleId?: string;
  autoSyncEnabled?: boolean;
  createdAt: number;
  lastSyncedAt?: number;
  totalSolved: number;
  totalCreated: number;
}

export interface AdminSession {
  token: string;
  username: string;
  expiresAt: number;
}

export interface GlobalAnnouncement {
  id?: string;
  message: string;
  isActive: boolean;
  type: 'info' | 'warning' | 'success';
  updatedAt: number;
}

