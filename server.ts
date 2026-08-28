import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import compression from "compression";
import { GoogleGenAI } from "@google/genai";
import {
  checkSupabaseStatus,
  fetchPuzzlesFromSupabase,
  upsertPuzzleToSupabase,
  deletePuzzleFromSupabase,
  fetchLeaderboardsFromSupabase,
  insertLeaderboardEntryToSupabase,
  fetchUserAccountsFromSupabase,
  upsertUserAccountToSupabase,
  fetchProfilesFromSupabase,
  upsertProfileToSupabase,
  getRuntimeSupabaseConfig,
  saveRuntimeSupabaseConfig,
} from "./lib/supabase.js";

const app = express();
const PORT = 3000;

// Enable HTTP response compression for high throughput & low bandwidth latency
app.use(compression());

// CORS & HTTP Headers Setup for browser and API requests
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token, Accept, x-supabase-url, x-supabase-key, X-Supabase-Url, X-Supabase-Key, *");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// URL Normalizer for Vercel / serverless routing
app.use((req, res, next) => {
  if (
    req.url &&
    !req.url.startsWith("/api/") &&
    !req.url.startsWith("/assets") &&
    !req.url.startsWith("/index.html") &&
    !req.url.includes(".")
  ) {
    req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  next();
});

// Crypto utilities for secure authentication
function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, s, 10000, 64, "sha512").toString("hex");
  return { salt: s, hash };
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const result = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return result === hash;
}

function generateAuthToken(): string {
  return "tkn_" + crypto.randomBytes(32).toString("hex");
}

// Lazy / Safe Gemini Client Initialization
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Dynamic Supabase credential injection from headers if provided
app.use((req, res, next) => {
  const customSbUrl = req.headers["x-supabase-url"] as string;
  const customSbKey = req.headers["x-supabase-key"] as string;
  if (customSbUrl && customSbKey) {
    saveRuntimeSupabaseConfig(customSbUrl, customSbKey);
  }
  next();
});

// Persistent storage file paths - Vercel Serverless safe
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel
  ? path.join("/tmp", "tts_data")
  : path.join(process.cwd(), "data");

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Storage directory initialization note:", e);
}

const PUZZLES_FILE = path.join(DATA_DIR, "cloud_puzzles.json");
const PUZZLES_BACKUP_FILE = path.join(DATA_DIR, "cloud_puzzles_backup.json");
const LEADERBOARDS_FILE = path.join(DATA_DIR, "cloud_leaderboards.json");
const PROFILES_FILE = path.join(DATA_DIR, "cloud_profiles.json");
const BACKUPS_FILE = path.join(DATA_DIR, "cloud_backups.json");
const USER_ACCOUNTS_FILE = path.join(DATA_DIR, "cloud_user_accounts.json");
const ANNOUNCEMENT_FILE = path.join(DATA_DIR, "cloud_announcement.json");
const ADMIN_SESSIONS_FILE = path.join(DATA_DIR, "cloud_admin_sessions.json");
const PRESENCE_FILE = path.join(DATA_DIR, "cloud_presence.json");

// Helper to read JSON files synchronously on boot
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    // safe fallback
  }
  return defaultValue;
}

// High-performance asynchronous queued file writing to avoid blocking the event loop
const pendingWrites = new Map<string, { timer: NodeJS.Timeout; data: any }>();

function writeJsonFile(filePath: string, data: any, immediate = false): void {
  const serialized = JSON.stringify(data, null, 2);

  if (immediate) {
    try {
      fs.writeFileSync(filePath, serialized, "utf-8");
    } catch (err) {
      // safe fallback on read-only environments
    }
    return;
  }

  // Debounce writes by 100ms to coalesce rapid writes into a single atomic write
  if (pendingWrites.has(filePath)) {
    clearTimeout(pendingWrites.get(filePath)!.timer);
  }

  const timer = setTimeout(async () => {
    pendingWrites.delete(filePath);
    try {
      await fs.promises.writeFile(filePath, serialized, "utf-8");
    } catch (err) {
      // safe fallback
    }
  }, 100);

  pendingWrites.set(filePath, { timer, data });
}

// In-memory cache synced with disk with automatic backup restore
let puzzlesCache: any[] = readJsonFile(PUZZLES_FILE, []);
if (puzzlesCache.length === 0) {
  const backupPuzzles = readJsonFile(PUZZLES_BACKUP_FILE, []);
  if (backupPuzzles.length > 0) {
    puzzlesCache = backupPuzzles;
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
  }
}
let leaderboardsCache: Record<string, any[]> = readJsonFile(LEADERBOARDS_FILE, {});
let profilesCache: Record<string, any> = readJsonFile(PROFILES_FILE, {});
let userAccountsCache: Record<string, any> = readJsonFile(USER_ACCOUNTS_FILE, {});
let announcementCache: any = readJsonFile(ANNOUNCEMENT_FILE, {
  message: "Selamat datang di Teka Teki Sharing! Buat, bagikan, dan selesaikan teka-teki silang bersama komunitas.",
  isActive: false,
  type: "info",
  updatedAt: Date.now(),
});
let adminSessionsCache: Record<string, { username: string; expiresAt: number }> = readJsonFile(ADMIN_SESSIONS_FILE, {});

// Site presence: total visits + online heartbeats
type PresenceStore = { totalVisits: number; online: Record<string, number> };
let presenceStore: PresenceStore = readJsonFile(PRESENCE_FILE, { totalVisits: 0, online: {} });
const ONLINE_TTL_MS = 60_000; // considered online if heartbeat within 60s

function pruneOnlineClients(now = Date.now()): number {
  const next: Record<string, number> = {};
  for (const [id, ts] of Object.entries(presenceStore.online || {})) {
    if (now - Number(ts) <= ONLINE_TTL_MS) {
      next[id] = Number(ts);
    }
  }
  presenceStore.online = next;
  return Object.keys(next).length;
}

function persistPresence(): void {
  writeJsonFile(PRESENCE_FILE, presenceStore);
}

// Administrator
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Administrator";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
// Secret for signing admin session tokens (works across serverless instances)
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD || "change-me-in-production";

if (!ADMIN_PASSWORD) {
  console.warn(
    "[SECURITY] ADMIN_PASSWORD is not set. Admin login will be disabled until you set it in environment variables."
  );
}

/** Create a signed admin token verifiable on any serverless instance */
function signAdminToken(username: string, expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ u: username, e: expiresAt })).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("base64url");
  return `adm_${payload}.${sig}`;
}

/** Verify signed admin token (no shared memory required) */
function verifyAdminToken(token: string): { username: string } | null {
  if (!token || !token.startsWith("adm_")) return null;
  const raw = token.slice(4);
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.u || !data?.e || Date.now() > Number(data.e)) return null;
    return { username: String(data.u) };
  } catch {
    return null;
  }
}

// Middleware to authenticate Administrator requests (serverless-safe)
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : (req.headers["x-admin-token"] as string);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Akses ditolak: Token administrator tidak ditemukan.",
    });
  }

  const verified = verifyAdminToken(token);
  if (!verified) {
    return res.status(401).json({
      success: false,
      message: "Sesi administrator tidak valid atau sudah kadaluarsa. Silakan login ulang.",
    });
  }

  (req as any).adminUser = verified.username;
  return next();
}

// Helper to ensure puzzles have reaction and comments containers
function normalizePuzzle(p: any): any {
  return {
    ...p,
    reactions: p.reactions || {
      like: 0,
      laugh: 0,
      love: 0,
      think: 0,
      fire: 0,
      sad: 0,
    },
    userReactions: p.userReactions || {},
    comments: Array.isArray(p.comments) ? p.comments : [],
  };
}

// Ensure loaded puzzles have default reactions and comments
puzzlesCache = puzzlesCache.map(normalizePuzzle);
writeJsonFile(PUZZLES_FILE, puzzlesCache);

// Sync in-memory cache with Supabase if configured
let initSupabasePromise: Promise<void> | null = null;

async function initSupabaseData() {
  if (initSupabasePromise) return initSupabasePromise;
  initSupabasePromise = (async () => {
  try {
    const status = await checkSupabaseStatus();
    if (!status.configured) {
      console.log("[Supabase] Belum dikonfigurasi. Menggunakan penyimpanan lokal JSON.");
      return;
    }

    console.log("[Supabase] Terhubung ke Supabase. Memulai sinkronisasi data...");

    // 1. Sync Puzzles
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles && sbPuzzles.length > 0) {
      const map = new Map<string, any>();
      puzzlesCache.forEach((p) => map.set(p.id, p));
      sbPuzzles.forEach((p) => map.set(p.id, normalizePuzzle(p)));
      puzzlesCache = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
      console.log(`[Supabase] Berhasil memuat ${sbPuzzles.length} teka-teki dari Supabase.`);
    } else if (puzzlesCache.length > 0) {
      // Seed local puzzles to Supabase in background
      console.log(`[Supabase] Mengunggah ${puzzlesCache.length} teka-teki lokal ke tabel Supabase...`);
      for (const p of puzzlesCache) {
        await upsertPuzzleToSupabase(p);
      }
    }

    // 2. Sync User Accounts
    const sbAccounts = await fetchUserAccountsFromSupabase();
    if (sbAccounts && Object.keys(sbAccounts).length > 0) {
      userAccountsCache = { ...userAccountsCache, ...sbAccounts };
      writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);
      console.log(`[Supabase] Berhasil memuat akun pengguna dari Supabase.`);
    } else if (Object.keys(userAccountsCache).length > 0) {
      for (const acc of Object.values(userAccountsCache)) {
        if (acc && typeof acc === 'object') {
          await upsertUserAccountToSupabase(acc);
        }
      }
    }

    // 3. Sync Leaderboards (merge + dedupe per pemain)
    const sbLeaderboards = await fetchLeaderboardsFromSupabase();
    if (sbLeaderboards && Object.keys(sbLeaderboards).length > 0) {
      for (const [pId, entries] of Object.entries(sbLeaderboards)) {
        if (!Array.isArray(entries)) continue;
        if (typeof upsertLocalLeaderboardEntry === "function") {
          for (const e of entries) {
            try { upsertLocalLeaderboardEntry(pId, e); } catch { /* ignore */ }
          }
        } else {
          if (!leaderboardsCache[pId]) leaderboardsCache[pId] = [];
          const map = new Map<string, any>();
          for (const e of [...leaderboardsCache[pId], ...entries]) {
            if (!e) continue;
            const k = e.playerId || e.playerEmail || e.playerName || e.id;
            const prev = map.get(k);
            if (!prev || (Number(e.timeMs) > 0 && Number(e.timeMs) < (Number(prev.timeMs) || Infinity))) {
              map.set(k, e);
            }
          }
          leaderboardsCache[pId] = Array.from(map.values());
        }
      }
      writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
      console.log(`[Supabase] Berhasil memuat leaderboard dari Supabase.`);
    }

    // 4. Sync Profiles
    const sbProfiles = await fetchProfilesFromSupabase();
    if (sbProfiles && Object.keys(sbProfiles).length > 0) {
      profilesCache = { ...profilesCache, ...sbProfiles };
      writeJsonFile(PROFILES_FILE, profilesCache);
    }
  } catch (err) {
    console.warn("[Supabase] Catatan sinkronisasi awal:", err);
  } finally {
    initSupabasePromise = null;
  }
  })();
  return initSupabasePromise;
}

// --- CLOUD DATABASE API ROUTES ---

// --- SITE PRESENCE (visits + online users) ---
app.post("/api/presence/heartbeat", (req, res) => {
  try {
    const clientId = String(req.body?.clientId || "").trim().slice(0, 80);
    const countVisit = Boolean(req.body?.countVisit);
    const now = Date.now();

    if (!presenceStore.online) presenceStore.online = {};
    if (typeof presenceStore.totalVisits !== "number") presenceStore.totalVisits = 0;

    if (clientId) {
      presenceStore.online[clientId] = now;
    }
    if (countVisit) {
      presenceStore.totalVisits = Math.max(0, presenceStore.totalVisits) + 1;
    }

    const online = pruneOnlineClients(now);
    persistPresence();

    res.json({
      success: true,
      totalVisits: presenceStore.totalVisits,
      online: Math.max(online, clientId ? 1 : 0),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memperbarui presence." });
  }
});

app.get("/api/presence/stats", (req, res) => {
  try {
    const online = pruneOnlineClients();
    res.json({
      success: true,
      totalVisits: presenceStore.totalVisits || 0,
      online,
    });
  } catch (err) {
    res.status(500).json({ success: false, totalVisits: 0, online: 0 });
  }
});

// Health & Database status check
app.get("/api/health", async (req, res) => {
  const sbStatus = await checkSupabaseStatus();
  res.json({
    status: "ok",
    totalPuzzles: puzzlesCache.length,
    supabase: sbStatus,
    timestamp: Date.now(),
  });
});

// GET Supabase status & SQL Schema Helper
app.get("/api/supabase/status", async (req, res) => {
  const status = await checkSupabaseStatus();
  res.json({
    success: true,
    data: status,
    sqlSchema: `-- =========================================================
-- SALIN & JALANKAN SQL INI DI MENU 'SQL EDITOR' SUPABASE ANDA
-- =========================================================

-- 1. TABEL TEKA-TEKI SILANG (PUZZLES)
CREATE TABLE IF NOT EXISTS puzzles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_id TEXT,
  author_avatar TEXT DEFAULT '🦊',
  author_email TEXT,
  custom_code TEXT UNIQUE,
  width INT NOT NULL DEFAULT 10,
  height INT NOT NULL DEFAULT 10,
  grid JSONB NOT NULL,
  clues JSONB NOT NULL,
  reactions JSONB DEFAULT '{"like":0,"laugh":0,"love":0,"think":0,"fire":0,"sad":0}',
  user_reactions JSONB DEFAULT '{}',
  comments JSONB DEFAULT '[]',
  is_draft BOOLEAN DEFAULT false,
  created_at BIGINT,
  updated_at BIGINT,
  data JSONB
);

-- 2. TABEL AKUN PENGGUNA (USER_ACCOUNTS)
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_id TEXT,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '🦊',
  photo_url TEXT,
  password_salt TEXT,
  password_hash TEXT,
  auth_token TEXT,
  sync_key TEXT,
  provider TEXT DEFAULT 'email',
  total_solved INT DEFAULT 0,
  total_created INT DEFAULT 0,
  puzzles JSONB DEFAULT '[]',
  drafts JSONB DEFAULT '[]',
  progress JSONB DEFAULT '{}',
  created_at BIGINT,
  last_synced_at BIGINT
);

-- 3. TABEL PAPAN PERINGKAT (LEADERBOARD)
CREATE TABLE IF NOT EXISTS leaderboard (
  id TEXT PRIMARY KEY,
  puzzle_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  player_avatar TEXT DEFAULT '🦊',
  player_id TEXT,
  player_email TEXT,
  time_ms BIGINT NOT NULL,
  score INT NOT NULL,
  formatted_time TEXT,
  completed_at BIGINT,
  data JSONB
);

-- 4. TABEL PROFIL PEMAIN (PROFILES)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT DEFAULT '🦊',
  sync_key TEXT,
  total_solved INT DEFAULT 0,
  total_created INT DEFAULT 0,
  updated_at BIGINT,
  data JSONB
);
`,
  });
});


// GET all published community puzzles (shared across all users)
// Always try Supabase first so every Vercel instance returns fresh data (Realtime-friendly)
app.get("/api/puzzles", async (req, res) => {
  try {
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles && sbPuzzles.length > 0) {
      const map = new Map<string, any>();
      puzzlesCache.forEach((p) => map.set(p.id, normalizePuzzle(p)));
      sbPuzzles.forEach((p) => map.set(p.id, normalizePuzzle(p)));
      puzzlesCache = Array.from(map.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
    }
  } catch (err) {
    console.warn("[API] /puzzles Supabase refresh note:", err);
  }

  const sorted = [...puzzlesCache].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({
    success: true,
    data: sorted,
  });
});

// GET puzzle by ID or custom code (refresh from Supabase when possible)
app.get("/api/puzzles/:query", async (req, res) => {
  try {
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles && sbPuzzles.length > 0) {
      const map = new Map<string, any>();
      puzzlesCache.forEach((p) => map.set(p.id, normalizePuzzle(p)));
      sbPuzzles.forEach((p) => map.set(p.id, normalizePuzzle(p)));
      puzzlesCache = Array.from(map.values());
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
    }
  } catch (err) {
    console.warn("[API] /puzzles/:query Supabase refresh note:", err);
  }

  const query = req.params.query.trim().toLowerCase();
  const found = puzzlesCache.find(
    (p) =>
      (p.id && p.id.toLowerCase() === query) ||
      (p.customCode && p.customCode.toLowerCase() === query)
  );

  if (found) {
    res.json({ success: true, data: found });
  } else {
    res.status(404).json({
      success: false,
      message: `Teka-teki dengan kode/ID "${req.params.query}" tidak ditemukan di database cloud.`,
    });
  }
});

// POST / publish or update a puzzle in the cloud database
app.post("/api/puzzles", (req, res) => {
  try {
    const puzzle = req.body;
    if (!puzzle || !puzzle.id || !puzzle.title || !puzzle.grid || !puzzle.clues) {
      return res.status(400).json({ success: false, message: "Data teka-teki tidak lengkap." });
    }

    const index = puzzlesCache.findIndex((p) => p.id === puzzle.id);
    const now = Date.now();
    const existing = index >= 0 ? puzzlesCache[index] : null;

    // Security Check: Only the original creator can update their puzzle
    if (existing && existing.authorId) {
      const incomingAuthorId = puzzle.authorId || req.headers['x-author-id'];
      if (incomingAuthorId && existing.authorId !== incomingAuthorId) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak: Anda tidak memiliki izin untuk merubah teka-teki silang milik pemain lain.",
        });
      }
    }

    const updatedPuzzle = {
      ...puzzle,
      updatedAt: now,
      createdAt: puzzle.createdAt || (existing ? existing.createdAt : now),
      authorId: puzzle.authorId || (existing ? existing.authorId : (req.headers['x-author-id'] as string)),
      isDraft: false,
      reactions: existing?.reactions || puzzle.reactions || {
        like: 0,
        laugh: 0,
        love: 0,
        think: 0,
        fire: 0,
        sad: 0,
      },
      userReactions: existing?.userReactions || puzzle.userReactions || {},
      comments: existing?.comments || puzzle.comments || [],
    };

    if (index >= 0) {
      puzzlesCache[index] = updatedPuzzle;
    } else {
      puzzlesCache.unshift(updatedPuzzle);
    }

    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    // Asynchronously upsert to Supabase
    upsertPuzzleToSupabase(updatedPuzzle).catch((err) => {
      console.warn("[Supabase] Notice on saving puzzle:", err);
    });

    res.json({
      success: true,
      message: "Teka-teki berhasil dipublikasikan ke Cloud Database!",
      data: updatedPuzzle,
    });
  } catch (error: any) {
    console.error("Error saving puzzle:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan teka-teki ke database." });
  }
});

// POST /api/puzzles/batch-sync: Restores and merges client-published puzzles to the cloud
app.post("/api/puzzles/batch-sync", (req, res) => {
  try {
    const { puzzles } = req.body;
    if (!Array.isArray(puzzles) || puzzles.length === 0) {
      return res.json({ success: true, count: puzzlesCache.length });
    }

    let addedCount = 0;
    puzzles.forEach((p) => {
      if (p && p.id && p.title && !p.isDraft) {
        const idx = puzzlesCache.findIndex((x) => x.id === p.id);
        const norm = normalizePuzzle(p);
        if (idx === -1) {
          puzzlesCache.unshift(norm);
          addedCount++;
        } else {
          // Preserve server reactions and comments
          puzzlesCache[idx] = {
            ...p,
            ...puzzlesCache[idx],
            reactions: puzzlesCache[idx].reactions || p.reactions,
            userReactions: puzzlesCache[idx].userReactions || p.userReactions || {},
            comments: puzzlesCache[idx].comments || p.comments || [],
          };
        }
        upsertPuzzleToSupabase(puzzlesCache[idx] || norm).catch(() => {});
      }
    });

    if (addedCount > 0) {
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
    }

    res.json({
      success: true,
      addedCount,
      totalCount: puzzlesCache.length,
      data: puzzlesCache,
    });
  } catch (err) {
    console.error("Error batch syncing puzzles:", err);
    res.status(500).json({ success: false, message: "Gagal batch sync puzzles." });
  }
});

// POST reaction to a crossword puzzle (like, laugh, love, think, fire, sad)
// Requirement: Only logged-in users and properly accumulated per user
app.post("/api/puzzles/:id/react", async (req, res) => {
  try {
    const { id } = req.params;
    const { reactionType, previousReaction, userId, userEmail } = req.body;
    const authHeader = req.headers.authorization;
    const authorHeaderId = req.headers["x-author-id"] as string;
    const effectiveUserId = userId || authorHeaderId;

    if (!effectiveUserId && !userEmail && !authHeader) {
      return res.status(401).json({
        success: false,
        message: "Hanya pengguna yang sudah login yang dapat memberikan reaksi.",
      });
    }

    const validTypes = ["like", "laugh", "love", "think", "fire", "sad"];
    const userKey = String(effectiveUserId || userEmail || "anon").toLowerCase();

    // Ambil puzzle: memory → Supabase
    let puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles && sbPuzzles.length > 0) {
          const map = new Map<string, any>();
          puzzlesCache.forEach((p) => map.set(p.id, normalizePuzzle(p)));
          sbPuzzles.forEach((p) => map.set(p.id, normalizePuzzle(p)));
          puzzlesCache = Array.from(map.values());
          writeJsonFile(PUZZLES_FILE, puzzlesCache);
          puzzle = puzzlesCache.find((p) => p.id === id);
        }
      } catch (e) {
        console.warn("[react] Supabase lookup note:", e);
      }
    }

    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki silang tidak ditemukan." });
    }

    if (!puzzle.reactions) {
      puzzle.reactions = { like: 0, laugh: 0, love: 0, think: 0, fire: 0, sad: 0 };
    }
    if (!puzzle.userReactions) {
      puzzle.userReactions = {};
    }

    const serverPreviousReaction = puzzle.userReactions[userKey] || previousReaction || null;

    if (
      serverPreviousReaction &&
      validTypes.includes(serverPreviousReaction) &&
      (puzzle.reactions[serverPreviousReaction] || 0) > 0
    ) {
      puzzle.reactions[serverPreviousReaction] = Math.max(
        0,
        (puzzle.reactions[serverPreviousReaction] || 0) - 1
      );
    }

    if (reactionType && validTypes.includes(reactionType)) {
      puzzle.reactions[reactionType] = (puzzle.reactions[reactionType] || 0) + 1;
      puzzle.userReactions[userKey] = reactionType;
    } else {
      delete puzzle.userReactions[userKey];
    }

    puzzle.updatedAt = Date.now();

    const idx = puzzlesCache.findIndex((p) => p.id === id);
    if (idx >= 0) puzzlesCache[idx] = puzzle;
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    // Tunggu upsert supaya reactions benar-benar masuk Supabase
    const ok = await upsertPuzzleToSupabase(puzzle);
    if (!ok) {
      console.warn("[react] Upsert ke Supabase gagal untuk", id, "reactions=", puzzle.reactions);
    }

    res.json({
      success: true,
      reactions: puzzle.reactions,
      userReaction: puzzle.userReactions[userKey] || null,
      persisted: ok,
      message: "Reaksi untuk teka-teki silang berhasil diperbarui!",
    });
  } catch (error) {
    console.error("Error reacting to puzzle:", error);
    res.status(500).json({ success: false, message: "Gagal mengirim reaksi." });
  }
});


// GET comments for a crossword puzzle
app.get("/api/puzzles/:id/comments", (req, res) => {
  const { id } = req.params;
  const puzzle = puzzlesCache.find((p) => p.id === id);
  if (!puzzle) {
    return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
  }
  res.json({
    success: true,
    data: puzzle.comments || [],
  });
});

// POST add comment to a crossword puzzle
// Requirement: Only logged-in users
app.post("/api/puzzles/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorName, authorAvatar, authorId, authorEmail, content } = req.body;
    const authHeader = req.headers.authorization;
    const authorHeaderId = req.headers['x-author-id'] as string;
    const effectiveAuthorId = authorId || authorHeaderId;

    // Requirement 3: Komentar dan reaksi hanya untuk pengguna yang sudah login
    if (!effectiveAuthorId && !authorEmail && !authHeader) {
      return res.status(401).json({
        success: false,
        message: "Hanya pengguna yang sudah login yang dapat menulis komentar pada teka-teki silang.",
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: "Isi komentar tidak boleh kosong." });
    }

    const puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki silang tidak ditemukan." });
    }

    if (!puzzle.comments) {
      puzzle.comments = [];
    }

    const newComment = {
      id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      puzzleId: id,
      authorName: (authorName || 'Pemain TTS').trim(),
      authorAvatar: authorAvatar || '🦊',
      authorId: effectiveAuthorId || '',
      authorEmail: authorEmail || '',
      content: content.trim(),
      createdAt: Date.now(),
    };

    puzzle.comments.push(newComment);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    const ok = await upsertPuzzleToSupabase(puzzle);
    if (!ok) console.warn("[comment] Upsert gagal", id);

    res.json({
      success: true,
      message: "Komentar berhasil ditambahkan ke Teka-Teki Silang!",
      data: newComment,
      totalComments: puzzle.comments.length,
    });
  } catch (error) {
    console.error("Error adding comment to puzzle:", error);
    res.status(500).json({ success: false, message: "Gagal menambahkan komentar." });
  }
});

// DELETE a comment from a crossword puzzle
app.delete("/api/puzzles/:id/comments/:commentId", (req, res) => {
  try {
    const { id, commentId } = req.params;
    const puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
    }

    if (puzzle.comments) {
      puzzle.comments = puzzle.comments.filter((c: any) => c.id !== commentId);
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      upsertPuzzleToSupabase(puzzle).catch(() => {});
    }

    res.json({ success: true, message: "Komentar berhasil dihapus." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menghapus komentar." });
  }
});

// DELETE a puzzle from cloud database
app.delete("/api/puzzles/:id", (req, res) => {
  try {
    const id = req.params.id;
    const puzzle = puzzlesCache.find((p) => p.id === id);
    
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
    }

    // Security Check: Only the original creator can delete their puzzle
    if (puzzle.authorId) {
      const requesterId = (req.headers['x-author-id'] as string) || (req.query.authorId as string);
      if (requesterId && puzzle.authorId !== requesterId) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak: Anda tidak memiliki izin untuk menghapus teka-teki silang buatan pemain lain.",
        });
      }
    }

    puzzlesCache = puzzlesCache.filter((p) => p.id !== id);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);

    deletePuzzleFromSupabase(id).catch(() => {});

    // Also clean up leaderboard for deleted puzzle
    if (leaderboardsCache[id]) {
      delete leaderboardsCache[id];
      writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
    }

    res.json({ success: true, message: "Teka-teki dan peringkat terkait berhasil dihapus dari cloud database." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menghapus teka-teki." });
  }
});


/** Sort leaderboard: waktu tercepat dulu (timeMs > 0), lalu skor tertinggi, lalu terbaru */
function sortLeaderboardEntries(list: any[]): any[] {
  return [...(list || [])]
    .filter((e) => e && (Number(e.timeMs) > 0 || Number(e.score) > 0))
    .sort((a, b) => {
      const ta = Number(a.timeMs) || Number.MAX_SAFE_INTEGER;
      const tb = Number(b.timeMs) || Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      const sa = Number(a.score) || 0;
      const sb = Number(b.score) || 0;
      if (sb !== sa) return sb - sa;
      return (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0);
    });
}

/** Kunci unik pemain untuk dedupe (1 skor terbaik per pemain per puzzle) */
function leaderboardPlayerKey(e: any): string {
  if (e.playerId) return "id:" + String(e.playerId).toLowerCase();
  if (e.playerEmail) return "email:" + String(e.playerEmail).toLowerCase().trim();
  return "name:" + String(e.playerName || "anon").toLowerCase().trim();
}

/**
 * Upsert entri leaderboard: simpan hanya rekor terbaik per pemain.
 * Lebih baik = timeMs lebih kecil; jika sama, score lebih tinggi.
 */
function upsertLocalLeaderboardEntry(puzzleId: string, entry: any): any {
  if (!leaderboardsCache[puzzleId]) leaderboardsCache[puzzleId] = [];
  const list = leaderboardsCache[puzzleId];
  const key = leaderboardPlayerKey(entry);
  const idx = list.findIndex((x) => leaderboardPlayerKey(x) === key);

  let finalEntry = { ...entry };
  if (idx >= 0) {
    const prev = list[idx];
    const prevT = Number(prev.timeMs) || Number.MAX_SAFE_INTEGER;
    const newT = Number(entry.timeMs) || Number.MAX_SAFE_INTEGER;
    const prevS = Number(prev.score) || 0;
    const newS = Number(entry.score) || 0;
    // Pertahankan yang lebih baik
    if (newT < prevT || (newT === prevT && newS > prevS)) {
      finalEntry = {
        ...prev,
        ...entry,
        id: prev.id || entry.id, // keep stable id for supabase upsert
        completedAt: entry.completedAt || Date.now(),
      };
      list[idx] = finalEntry;
    } else {
      finalEntry = prev; // tidak mengganti rekor lama
    }
  } else {
    list.push(finalEntry);
  }

  leaderboardsCache[puzzleId] = sortLeaderboardEntries(list).slice(0, 100);
  writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
  return finalEntry;
}

async function ensureLeaderboardsFromSupabase() {
  try {
    const sb = await fetchLeaderboardsFromSupabase();
    if (!sb || Object.keys(sb).length === 0) return;
    for (const [pId, entries] of Object.entries(sb)) {
      if (!Array.isArray(entries)) continue;
      if (!leaderboardsCache[pId]) leaderboardsCache[pId] = [];
      for (const e of entries) {
        upsertLocalLeaderboardEntry(pId, e);
      }
    }
  } catch (err) {
    console.warn("[leaderboard] Supabase merge note:", err);
  }
}


// GET all leaderboard entries (Global, filtered to active existing puzzles only)
app.get("/api/leaderboards", async (req, res) => {
  try {
    await ensureLeaderboardsFromSupabase();
    const activePuzzleIds = new Set(puzzlesCache.map((p) => p.id));
    // Jika puzzlesCache kosong di instance ini, coba isi dari Supabase
    if (activePuzzleIds.size === 0) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles?.length) {
          sbPuzzles.forEach((p: any) => activePuzzleIds.add(p.id));
        }
      } catch { /* ignore */ }
    }

    const allEntries: any[] = [];
    Object.entries(leaderboardsCache).forEach(([puzzleId, entries]) => {
      if ((!activePuzzleIds.size || activePuzzleIds.has(puzzleId)) && Array.isArray(entries)) {
        allEntries.push(...entries);
      }
    });

    const sorted = sortLeaderboardEntries(allEntries);
    res.json({ success: true, data: sorted.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data peringkat global." });
  }
});

// GET leaderboard entries for a specific puzzle
app.get("/api/leaderboard/:puzzleId", async (req, res) => {
  try {
    const puzzleId = req.params.puzzleId;
    await ensureLeaderboardsFromSupabase();
    const sorted = sortLeaderboardEntries(leaderboardsCache[puzzleId] || []);
    res.json({ success: true, data: sorted });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil leaderboard." });
  }
});

// POST submit a leaderboard entry (global across all users)
app.post("/api/leaderboard/:puzzleId", async (req, res) => {
  try {
    const puzzleId = req.params.puzzleId;
    const entry = req.body;

    if (!entry || !entry.playerName || entry.timeMs === undefined) {
      return res.status(400).json({ success: false, message: "Data skor tidak valid." });
    }

    const timeMs = Number(entry.timeMs) || 0;
    if (timeMs <= 0) {
      return res.status(400).json({ success: false, message: "Waktu pengerjaan tidak valid." });
    }

    await ensureLeaderboardsFromSupabase();

    const newEntry = {
      id: entry.id || "lead_" + Math.random().toString(36).substring(2, 11),
      puzzleId,
      playerName: String(entry.playerName).trim() || "Pemain TTS",
      playerAvatar: entry.playerAvatar || "🦊",
      playerId: entry.playerId || entry.userId || null,
      playerEmail: entry.playerEmail || entry.email || null,
      timeMs,
      score: Number(entry.score) || 1000,
      formattedTime: entry.formattedTime || null,
      completedAt: Number(entry.completedAt) || Date.now(),
      puzzleTitle: entry.puzzleTitle || null,
    };

    const saved = upsertLocalLeaderboardEntry(puzzleId, newEntry);
    const ok = await insertLeaderboardEntryToSupabase(puzzleId, saved);
    if (!ok) {
      console.warn("[leaderboard] Upsert Supabase gagal untuk", puzzleId, saved.id);
    }

    res.json({
      success: true,
      message: "Skor berhasil disimpan di leaderboard cloud!",
      data: saved,
      persisted: ok,
    });
  } catch (error) {
    console.error("Leaderboard submit error:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan skor." });
  }
});

// --- USER PROFILE & CLOUD PERSISTENCE ---

// GET user profile by ID or Sync Key
app.get("/api/profile/:key", (req, res) => {
  const key = req.params.key;
  const profile = profilesCache[key];
  if (profile) {
    res.json({ success: true, data: profile });
  } else {
    res.status(404).json({ success: false, message: "Profil tidak ditemukan di cloud." });
  }
});

// POST save / update user profile
app.post("/api/profile", (req, res) => {
  try {
    const profile = req.body;
    if (!profile || !profile.id || !profile.name) {
      return res.status(400).json({ success: false, message: "Data profil tidak lengkap." });
    }

    const updatedProfile = {
      ...profile,
      updatedAt: Date.now(),
    };

    profilesCache[profile.id] = updatedProfile;
    if (profile.syncKey) {
      profilesCache[profile.syncKey] = updatedProfile;
    }
    writeJsonFile(PROFILES_FILE, profilesCache);

    upsertProfileToSupabase(updatedProfile).catch(() => {});

    res.json({ success: true, message: "Profil berhasil disimpan ke cloud database!", data: updatedProfile });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menyimpan profil." });
  }
});

// POST full database sync
app.post("/api/sync", (req, res) => {
  try {
    const { profile, puzzles, leaderboards } = req.body;

    // 1. Sync profile
    if (profile && profile.id) {
      profilesCache[profile.id] = { ...profile, updatedAt: Date.now() };
      if (profile.syncKey) profilesCache[profile.syncKey] = profilesCache[profile.id];
      writeJsonFile(PROFILES_FILE, profilesCache);
    }

    // 2. Merge uploaded puzzles
    if (Array.isArray(puzzles)) {
      puzzles.forEach((p) => {
        if (p && p.id && !p.isDraft) {
          const idx = puzzlesCache.findIndex((x) => x.id === p.id);
          if (idx >= 0) {
            puzzlesCache[idx] = { ...puzzlesCache[idx], ...p };
          } else {
            puzzlesCache.unshift(p);
          }
        }
      });
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
    }

    // 3. Merge leaderboards
    if (leaderboards && typeof leaderboards === 'object') {
      Object.entries(leaderboards).forEach(([pId, entries]) => {
        if (Array.isArray(entries)) {
          if (!leaderboardsCache[pId]) leaderboardsCache[pId] = [];
          entries.forEach((e: any) => {
            if (e && e.playerName && !leaderboardsCache[pId].some((x) => x.id === e.id)) {
              leaderboardsCache[pId].push(e);
            }
          });
          leaderboardsCache[pId].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.timeMs || 0) - (b.timeMs || 0));
        }
      });
      writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
    }

    res.json({
      success: true,
      message: `Database berhasil disinkronisasi dengan ${puzzlesCache.length} teka-teki aktif!`,
      cloudPuzzlesCount: puzzlesCache.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal memproses sinkronisasi database." });
  }
});

// --- SECURE CLOUD ACCOUNT AUTHENTICATION & LIVE AUTO-SYNC ---

// 1. Google One-Tap / GSI / OAuth2 Sign-In Verification
app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential, accessToken, currentProfile, currentPuzzles, currentDrafts, currentProgress } = req.body;

    if (!credential && !accessToken) {
      return res.status(400).json({ success: false, message: "Token kredensial Google tidak ditemukan." });
    }

    let googlePayload: any = null;

    // A. If OAuth2 access token provided (from initTokenClient popup)
    if (accessToken) {
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userInfoRes.ok) {
          googlePayload = await userInfoRes.json();
        }
      } catch (e) {
        console.warn("Google userinfo fetch failed:", e);
      }
    }

    // B. If ID Token credential provided
    if (!googlePayload && credential) {
      // Verify token with Google TokenInfo API
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (verifyRes.ok) {
          googlePayload = await verifyRes.json();
        }
      } catch (e) {
        console.warn("Direct Google API verify failed, fallback to JWT payload parsing:", e);
      }

      // Fallback: Parse and validate JWT payload structure
      if (!googlePayload || !googlePayload.sub) {
        try {
          const parts = credential.split(".");
          if (parts.length === 3) {
            const payloadJson = Buffer.from(parts[1], "base64").toString("utf-8");
            const parsed = JSON.parse(payloadJson);
            if (parsed.sub && parsed.email) {
              googlePayload = parsed;
            }
          }
        } catch (err) {
          console.error("JWT parse error:", err);
        }
      }
    }

    if (!googlePayload || !googlePayload.email || !googlePayload.sub) {
      return res.status(401).json({
        success: false,
        message: "Token Google tidak valid atau telah kadaluarsa. Silakan coba login kembali.",
      });
    }

    const email = googlePayload.email.trim().toLowerCase();
    const googleId = googlePayload.sub;
    const name = googlePayload.name || (email.split("@")[0]);
    const photoUrl = googlePayload.picture || "";
    const accountKey = `google_${googleId}`;

    let account = userAccountsCache[accountKey] || userAccountsCache[email];
    const authToken = generateAuthToken();

    if (!account) {
      // Create new verified Google account
      const syncKey = "SYNC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      account = {
        id: "usr_" + googleId.substring(0, 12),
        googleId,
        email,
        name,
        avatar: "🦊",
        photoUrl,
        provider: "google",
        syncKey,
        authToken,
        isLoggedIn: true,
        autoSyncEnabled: true,
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
        totalSolved: (currentProfile && currentProfile.totalSolved) || 0,
        totalCreated: (currentProfile && currentProfile.totalCreated) || 0,
        puzzles: Array.isArray(currentPuzzles) ? currentPuzzles : [],
        drafts: Array.isArray(currentDrafts) ? currentDrafts : [],
        progress: currentProgress || {},
      };
    } else {
      // Existing Google account
      account.googleId = googleId;
      account.email = email;
      account.authToken = authToken;
      account.lastSyncedAt = Date.now();
      account.isLoggedIn = true;
      if (photoUrl) account.photoUrl = photoUrl;
      if (!account.name) account.name = name;

      // Safe merge of device puzzles if any
      if (Array.isArray(currentPuzzles) && currentPuzzles.length > 0) {
        if (!Array.isArray(account.puzzles)) account.puzzles = [];
        currentPuzzles.forEach((p) => {
          if (p && p.id && !account.puzzles.some((x: any) => x.id === p.id)) {
            account.puzzles.push(p);
          }
        });
      }

      // Safe merge of drafts
      if (Array.isArray(currentDrafts) && currentDrafts.length > 0) {
        if (!Array.isArray(account.drafts)) account.drafts = [];
        currentDrafts.forEach((d) => {
          if (d && d.id && !account.drafts.some((x: any) => x.id === d.id)) {
            account.drafts.push(d);
          }
        });
      }
    }

    userAccountsCache[accountKey] = account;
    userAccountsCache[email] = account;
    userAccountsCache[account.id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(account).catch(() => {});

    res.json({
      success: true,
      message: `Login Google Berhasil! Selamat datang, ${account.name}`,
      profile: {
        id: account.id,
        name: account.name,
        avatar: account.avatar || "🦊",
        email: account.email,
        photoUrl: account.photoUrl,
        syncKey: account.syncKey,
        authToken,
        googleId,
        isLoggedIn: true,
        provider: "google",
        autoSyncEnabled: true,
        createdAt: account.createdAt,
        lastSyncedAt: account.lastSyncedAt,
        totalSolved: account.totalSolved || 0,
        totalCreated: account.totalCreated || 0,
      },
      puzzles: account.puzzles || [],
      drafts: account.drafts || [],
      progress: account.progress || {},
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan saat memverifikasi akun Google." });
  }
});

// 2. Email & Password Registration
app.post("/api/auth/register-email", (req, res) => {
  try {
    const { email, password, name, avatar, currentProfile, currentPuzzles, currentDrafts, currentProgress } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email dan kata sandi wajib diisi." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Kata sandi minimal 6 karakter demi keamanan akun Anda." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = userAccountsCache[cleanEmail];

    if (existing) {
      return res.status(409).json({
        success: false,
        isExistingEmail: true,
        message: "Email ini sudah terdaftar! Silakan gunakan tab 'Masuk (Login)' untuk mengakses akun Anda.",
      });
    }

    const { salt, hash } = hashPassword(password);
    const authToken = generateAuthToken();
    const syncKey = "SYNC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = "usr_" + Math.random().toString(36).substring(2, 10);

    const account = {
      id,
      email: cleanEmail,
      name: name?.trim() || cleanEmail.split("@")[0] || "Pemain TTS",
      avatar: avatar || "🦊",
      passwordSalt: salt,
      passwordHash: hash,
      authToken,
      provider: "email",
      syncKey,
      isLoggedIn: true,
      autoSyncEnabled: true,
      createdAt: Date.now(),
      lastSyncedAt: Date.now(),
      totalSolved: (currentProfile && currentProfile.totalSolved) || 0,
      totalCreated: (currentProfile && currentProfile.totalCreated) || 0,
      puzzles: Array.isArray(currentPuzzles) ? currentPuzzles : [],
      drafts: Array.isArray(currentDrafts) ? currentDrafts : [],
      progress: currentProgress || {},
    };

    userAccountsCache[cleanEmail] = account;
    userAccountsCache[id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(account).catch(() => {});

    res.json({
      success: true,
      message: `Akun ${account.email} berhasil didaftarkan dan dilindungi kata sandi!`,
      profile: {
        id: account.id,
        name: account.name,
        avatar: account.avatar,
        email: account.email,
        syncKey: account.syncKey,
        authToken,
        isLoggedIn: true,
        provider: "email",
        autoSyncEnabled: true,
        createdAt: account.createdAt,
        lastSyncedAt: account.lastSyncedAt,
        totalSolved: account.totalSolved || 0,
        totalCreated: account.totalCreated || 0,
      },
      puzzles: account.puzzles || [],
      drafts: account.drafts || [],
      progress: account.progress || {},
    });
  } catch (error) {
    console.error("Register email error:", error);
    res.status(500).json({ success: false, message: "Gagal membuat akun." });
  }
});

// 3. Email & Password Login
app.post("/api/auth/login-email", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email dan kata sandi wajib diisi." });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        errorType: "invalid_password_length",
        message: "Kata sandi minimal 6 karakter.",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const account = userAccountsCache[cleanEmail];

    if (!account) {
      return res.status(404).json({
        success: false,
        errorType: "account_not_found",
        message: "Email belum terdaftar. Silakan pilih tab 'Daftar Akun Baru' untuk membuat akun.",
      });
    }

    // Verify Password
    if (!account.passwordSalt || !account.passwordHash || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      return res.status(401).json({
        success: false,
        errorType: "wrong_password",
        message: "Email terdaftar, namun kata sandi yang Anda masukkan salah. Silakan periksa kembali huruf besar/kecil dan kombinasi kata sandi Anda.",
      });
    }

    // Successful login -> issue new authToken
    const authToken = generateAuthToken();
    account.authToken = authToken;
    account.lastSyncedAt = Date.now();
    account.isLoggedIn = true;

    userAccountsCache[cleanEmail] = account;
    userAccountsCache[account.id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(account).catch(() => {});

    res.json({
      success: true,
      message: `Selamat datang kembali, ${account.name}! Data cloud Anda telah terhubung.`,
      profile: {
        id: account.id,
        name: account.name,
        avatar: account.avatar || "🦊",
        email: account.email,
        syncKey: account.syncKey,
        authToken,
        isLoggedIn: true,
        provider: "email",
        autoSyncEnabled: true,
        createdAt: account.createdAt,
        lastSyncedAt: account.lastSyncedAt,
        totalSolved: account.totalSolved || 0,
        totalCreated: account.totalCreated || 0,
      },
      puzzles: account.puzzles || [],
      drafts: account.drafts || [],
      progress: account.progress || {},
    });
  } catch (error) {
    console.error("Login email error:", error);
    res.status(500).json({ success: false, message: "Gagal memproses login akun." });
  }
});

// 4. Secure Live Background Auto-Sync for Verified Accounts
app.post("/api/auth/auto-sync", async (req, res) => {
  try {
    const { profile, puzzles, drafts, progress, authToken } = req.body;
    if (!profile || !profile.email) {
      return res.status(400).json({ success: false, message: "Profil akun tidak valid." });
    }

    const cleanEmail = profile.email.trim().toLowerCase();
    const token = authToken || req.headers.authorization?.replace("Bearer ", "");

    // Cari di memory instance ini dulu
    let account =
      userAccountsCache[cleanEmail] ||
      (profile.id ? userAccountsCache[profile.id] : null);

    // Jika instance lain / cold start: ambil dari Supabase
    if (!account) {
      try {
        const sbAccounts = await fetchUserAccountsFromSupabase();
        if (sbAccounts) {
          userAccountsCache = { ...userAccountsCache, ...sbAccounts };
          writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);
          account =
            userAccountsCache[cleanEmail] ||
            (profile.id ? userAccountsCache[profile.id] : null);
        }
      } catch (e) {
        console.warn("[auto-sync] Supabase account lookup note:", e);
      }
    }

    if (!account) {
      // Jangan 404 keras — buat entri minimal agar sync tetap jalan
      account = {
        id: profile.id || "u_" + Date.now().toString(36),
        email: cleanEmail,
        name: profile.name || "Pemain TTS",
        avatar: profile.avatar || "🦊",
        provider: profile.provider || "email",
        totalSolved: profile.totalSolved || 0,
        totalCreated: profile.totalCreated || 0,
        puzzles: [],
        drafts: [],
        progress: {},
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
        authToken: token || null,
      };
    }

    // Security: jika token server ada dan client kirim token beda → tolak
    if (account.authToken && token && account.authToken !== token) {
      return res.status(403).json({
        success: false,
        message: "Token otentikasi tidak valid atau telah kadaluarsa. Silakan login kembali.",
      });
    }

    account.lastSyncedAt = Date.now();
    if (profile.name) account.name = profile.name;
    if (profile.avatar) account.avatar = profile.avatar;
    if (profile.totalSolved !== undefined) account.totalSolved = profile.totalSolved;
    if (profile.totalCreated !== undefined) account.totalCreated = profile.totalCreated;
    if (Array.isArray(puzzles)) account.puzzles = puzzles;
    if (Array.isArray(drafts)) account.drafts = drafts;
    if (progress) account.progress = progress;
    if (token && !account.authToken) account.authToken = token;

    userAccountsCache[cleanEmail] = account;
    if (account.id) userAccountsCache[account.id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(account).catch(() => {});

    res.json({
      success: true,
      message: `Data otomatis tersimpan di cloud pada ${new Date().toLocaleTimeString("id-ID")}`,
      lastSyncedAt: account.lastSyncedAt,
    });
  } catch (error) {
    console.error("Auto sync error:", error);
    res.status(500).json({ success: false, message: "Gagal melakukan auto-sync cloud." });
  }
});

// ============================================================================
// --- ADMINISTRATOR API ROUTES & MODERATION SYSTEM ---
// ============================================================================

// 1. Admin Authentication Login
app.post("/api/admin/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!ADMIN_PASSWORD) {
      return res.status(503).json({
        success: false,
        message: "Admin login belum dikonfigurasi (ADMIN_PASSWORD belum di-set di server).",
      });
    }

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan Password Admin wajib diisi.",
      });
    }

    const cleanUser = username.trim();
    if (
      cleanUser.toLowerCase() === ADMIN_USERNAME.toLowerCase() &&
      password === ADMIN_PASSWORD
    ) {
      const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 hari
      const token = signAdminToken(ADMIN_USERNAME, expiresAt);

      return res.json({
        success: true,
        message: "Login Administrator Berhasil!",
        token,
        username: ADMIN_USERNAME,
        expiresAt,
      });
    }

    return res.status(401).json({
      success: false,
      message: "Kombinasi Username atau Password Administrator salah.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memproses login admin." });
  }
});

// 2. Verify Admin Session Token
app.get("/api/admin/verify", requireAdminAuth, (req, res) => {
  res.json({
    success: true,
    username: (req as any).adminUser || ADMIN_USERNAME,
  });
});

// 3. Admin Logout
app.post("/api/admin/logout", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : (req.headers["x-admin-token"] as string);
  if (token && adminSessionsCache[token]) {
    delete adminSessionsCache[token];
    writeJsonFile(ADMIN_SESSIONS_FILE, adminSessionsCache);
  }
  res.json({ success: true, message: "Berhasil logout dari sesi administrator." });
});

// 4. Admin Overview & Analytics Stats
app.get("/api/admin/stats", requireAdminAuth, async (req, res) => {
  try {
    // Dynamic sync with Supabase if connected
    await initSupabaseData();

    const seenUserIds = new Set<string>();
    const userList: any[] = [];
    Object.values(userAccountsCache).forEach((acc) => {
      if (acc && acc.id && !seenUserIds.has(acc.id)) {
        seenUserIds.add(acc.id);
        userList.push(acc);
      }
    });

    let totalComments = 0;
    let totalReactions = 0;
    puzzlesCache.forEach((p) => {
      if (Array.isArray(p.comments)) totalComments += p.comments.length;
      if (p.reactions) {
        Object.values(p.reactions).forEach((v: any) => {
          totalReactions += Number(v) || 0;
        });
      }
    });

    let totalLeaderboardRecords = 0;
    Object.values(leaderboardsCache).forEach((list) => {
      if (Array.isArray(list)) totalLeaderboardRecords += list.length;
    });

    const sbStatus = await checkSupabaseStatus();

    res.json({
      success: true,
      stats: {
        totalUsers: userList.length,
        totalPuzzles: puzzlesCache.length,
        featuredPuzzles: puzzlesCache.filter((p) => p.isFeatured).length,
        draftPuzzles: puzzlesCache.filter((p) => p.isDraft).length,
        totalLeaderboardRecords,
        totalComments,
        totalReactions,
        supabaseConfigured: sbStatus.configured,
        supabaseConnected: sbStatus.connected,
        supabaseTablesReady: sbStatus.tablesReady,
        supabaseStatusDetails: sbStatus,
        serverUptimeSec: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        nodeVersion: process.version,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat statistik admin." });
  }
});

// 4.1 Admin Manual Trigger Force Sync Supabase
app.post("/api/admin/sync", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
    const sbStatus = await checkSupabaseStatus();

    const seenUserIds = new Set<string>();
    const userList: any[] = [];
    Object.values(userAccountsCache).forEach((acc) => {
      if (acc && acc.id && !seenUserIds.has(acc.id)) {
        seenUserIds.add(acc.id);
        userList.push(acc);
      }
    });

    res.json({
      success: true,
      message: sbStatus.connected
        ? (sbStatus.tablesReady 
            ? "Sinkronisasi dengan Supabase Cloud berhasil! Data telah tersinkron."
            : "Terhubung ke Supabase Cloud! Namun pastikan Anda telah menjalankan skrip SQL untuk membuat tabel.")
        : "Supabase belum terhubung. Periksa URL dan Kunci API Supabase Anda.",
      status: sbStatus,
      stats: {
        totalUsers: userList.length,
        totalPuzzles: puzzlesCache.length,
        supabaseConnected: sbStatus.connected,
        supabaseTablesReady: sbStatus.tablesReady,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal sinkronisasi: " + (err?.message || "Error") });
  }
});

// 4.2 Admin Supabase Direct Configuration Update
app.post("/api/admin/supabase-config", requireAdminAuth, async (req, res) => {
  try {
    const { url, key } = req.body || {};
    if (!url || !key) {
      return res.status(400).json({
        success: false,
        message: "SUPABASE_URL dan SUPABASE_KEY / SERVICE_ROLE_KEY wajib diisi.",
      });
    }

    const saved = saveRuntimeSupabaseConfig(url, key);
    if (!saved) {
      return res.status(500).json({ success: false, message: "Gagal menyimpan konfigurasi runtime." });
    }

    // Test immediately
    const status = await checkSupabaseStatus();
    if (status.connected) {
      // Trigger sync
      await initSupabaseData();
    }

    res.json({
      success: true,
      message: status.connected
        ? "Konfigurasi Supabase berhasil disimpan dan terhubung!"
        : "Konfigurasi disimpan, namun host Supabase belum merespons: " + (status.error || "Periksa kembali URL & Key"),
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Gagal menyimpan konfigurasi: " + (err?.message || "Error") });
  }
});

// 5. Admin - List All Users
app.get("/api/admin/users", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
    const seenIds = new Set<string>();
    const users: any[] = [];

    Object.values(userAccountsCache).forEach((acc) => {
      if (acc && acc.id && !seenIds.has(acc.id)) {
        seenIds.add(acc.id);
        users.push({
          id: acc.id,
          email: acc.email || "-",
          name: acc.name || "Pemain TTS",
          avatar: acc.avatar || "🦊",
          photoUrl: acc.photoUrl,
          provider: acc.provider || "email",
          syncKey: acc.syncKey,
          totalSolved: acc.totalSolved || 0,
          totalCreated: acc.totalCreated || 0,
          puzzlesCount: Array.isArray(acc.puzzles) ? acc.puzzles.length : 0,
          draftsCount: Array.isArray(acc.drafts) ? acc.drafts.length : 0,
          createdAt: acc.createdAt || 0,
          lastSyncedAt: acc.lastSyncedAt || 0,
          isBanned: Boolean(acc.isBanned),
          role: acc.role || "user",
        });
      }
    });

    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat daftar pengguna." });
  }
});

// 6. Admin - Update User (Ban/Unban, Edit Info, Reset Stats)
app.put("/api/admin/users/:id", requireAdminAuth, (req, res) => {
  try {
    const userId = req.params.id;
    const { isBanned, name, totalSolved, totalCreated } = req.body;

    let targetAcc: any = null;
    for (const key of Object.keys(userAccountsCache)) {
      const acc = userAccountsCache[key];
      if (acc && (acc.id === userId || acc.email?.toLowerCase() === userId.toLowerCase())) {
        targetAcc = acc;
        break;
      }
    }

    if (!targetAcc) {
      return res.status(404).json({ success: false, message: "Akun pengguna tidak ditemukan." });
    }

    if (isBanned !== undefined) targetAcc.isBanned = Boolean(isBanned);
    if (name) targetAcc.name = String(name).trim();
    if (totalSolved !== undefined) targetAcc.totalSolved = Number(totalSolved);
    if (totalCreated !== undefined) targetAcc.totalCreated = Number(totalCreated);

    targetAcc.lastSyncedAt = Date.now();

    userAccountsCache[targetAcc.id] = targetAcc;
    if (targetAcc.email) userAccountsCache[targetAcc.email.toLowerCase()] = targetAcc;
    if (targetAcc.googleId) userAccountsCache[`google_${targetAcc.googleId}`] = targetAcc;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(targetAcc).catch(() => {});

    res.json({ success: true, message: "Data pengguna berhasil diperbarui.", data: targetAcc });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memperbarui data pengguna." });
  }
});

// 7. Admin - Reset User Password
app.post("/api/admin/users/:id/reset-password", requireAdminAuth, (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Kata sandi baru minimal 6 karakter." });
    }

    let targetAcc: any = null;
    for (const key of Object.keys(userAccountsCache)) {
      const acc = userAccountsCache[key];
      if (acc && (acc.id === userId || acc.email?.toLowerCase() === userId.toLowerCase())) {
        targetAcc = acc;
        break;
      }
    }

    if (!targetAcc) {
      return res.status(404).json({ success: false, message: "Akun pengguna tidak ditemukan." });
    }

    const { salt, hash } = hashPassword(newPassword);
    targetAcc.passwordSalt = salt;
    targetAcc.passwordHash = hash;
    targetAcc.authToken = generateAuthToken();
    targetAcc.lastSyncedAt = Date.now();

    userAccountsCache[targetAcc.id] = targetAcc;
    if (targetAcc.email) userAccountsCache[targetAcc.email.toLowerCase()] = targetAcc;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);

    upsertUserAccountToSupabase(targetAcc).catch(() => {});

    res.json({ success: true, message: `Kata sandi untuk akun ${targetAcc.email || targetAcc.name} berhasil direset!` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mereset kata sandi pengguna." });
  }
});

// 8. Admin - Delete User Account
app.delete("/api/admin/users/:id", requireAdminAuth, (req, res) => {
  try {
    const userId = req.params.id;
    let targetAcc: any = null;

    for (const key of Object.keys(userAccountsCache)) {
      const acc = userAccountsCache[key];
      if (acc && (acc.id === userId || acc.email?.toLowerCase() === userId.toLowerCase())) {
        targetAcc = acc;
        delete userAccountsCache[key];
      }
    }

    if (!targetAcc) {
      return res.status(404).json({ success: false, message: "Akun tidak ditemukan." });
    }

    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);
    res.json({ success: true, message: `Akun ${targetAcc.email || targetAcc.name} berhasil dihapus dari cloud database.` });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal menghapus akun pengguna." });
  }
});

// 9. Admin - List All Puzzles for Moderation
app.get("/api/admin/puzzles", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
    res.json({
      success: true,
      data: puzzlesCache,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat daftar teka-teki." });
  }
});

// 10. Admin - Toggle Feature Puzzle (Pilihan Editor)
app.post("/api/admin/puzzles/:id/toggle-feature", requireAdminAuth, (req, res) => {
  const pId = req.params.id;
  const idx = puzzlesCache.findIndex((p) => p.id === pId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
  }

  puzzlesCache[idx].isFeatured = !puzzlesCache[idx].isFeatured;
  puzzlesCache[idx].updatedAt = Date.now();

  writeJsonFile(PUZZLES_FILE, puzzlesCache);
  upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => {});

  res.json({
    success: true,
    message: puzzlesCache[idx].isFeatured ? "Teka-teki ditandai sebagai Pilihan Editor ⭐" : "Tanda Pilihan Editor dihapus.",
    isFeatured: puzzlesCache[idx].isFeatured,
  });
});

// 11. Admin - Edit Puzzle Metadata
app.put("/api/admin/puzzles/:id", requireAdminAuth, (req, res) => {
  const pId = req.params.id;
  const idx = puzzlesCache.findIndex((p) => p.id === pId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
  }

  const { title, description, category, difficulty, isFeatured } = req.body;
  if (title) puzzlesCache[idx].title = String(title).trim();
  if (description !== undefined) puzzlesCache[idx].description = String(description).trim();
  if (category) puzzlesCache[idx].category = String(category).trim();
  if (difficulty) puzzlesCache[idx].difficulty = difficulty;
  if (isFeatured !== undefined) puzzlesCache[idx].isFeatured = Boolean(isFeatured);
  puzzlesCache[idx].updatedAt = Date.now();

  writeJsonFile(PUZZLES_FILE, puzzlesCache);
  upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => {});

  res.json({ success: true, message: "Teka-teki berhasil diperbarui oleh Administrator.", data: puzzlesCache[idx] });
});

// 12. Admin - Permanently Delete Puzzle
app.delete("/api/admin/puzzles/:id", requireAdminAuth, (req, res) => {
  const pId = req.params.id;
  const idx = puzzlesCache.findIndex((p) => p.id === pId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
  }

  const deleted = puzzlesCache.splice(idx, 1)[0];
  delete leaderboardsCache[pId];

  writeJsonFile(PUZZLES_FILE, puzzlesCache);
  writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
  writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);

  deletePuzzleFromSupabase(pId).catch(() => {});

  res.json({ success: true, message: `Teka-teki "${deleted.title}" berhasil dihapus secara permanen.` });
});

// 13. Admin - List All Comments Across All Puzzles
app.get("/api/admin/comments", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
  const allComments: any[] = [];
  puzzlesCache.forEach((p) => {
    if (Array.isArray(p.comments)) {
      p.comments.forEach((c) => {
        allComments.push({
          ...c,
          puzzleId: p.id,
          puzzleTitle: p.title,
          puzzleAuthor: p.authorName,
        });
      });
    }
  });
  allComments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ success: true, data: allComments });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat komentar." });
  }
});

// 14. Admin - Delete Any Comment
app.delete("/api/admin/comments/:puzzleId/:commentId", requireAdminAuth, (req, res) => {
  const { puzzleId, commentId } = req.params;
  const pIdx = puzzlesCache.findIndex((p) => p.id === puzzleId);
  if (pIdx >= 0 && Array.isArray(puzzlesCache[pIdx].comments)) {
    puzzlesCache[pIdx].comments = puzzlesCache[pIdx].comments.filter((c: any) => c.id !== commentId);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    upsertPuzzleToSupabase(puzzlesCache[pIdx]).catch(() => {});
  }
  res.json({ success: true, message: "Komentar berhasil dimoderasi dan dihapus." });
});

// 15. Admin - List All Leaderboard Entries
app.get("/api/admin/leaderboards", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
  const allEntries: any[] = [];
  Object.entries(leaderboardsCache).forEach(([puzzleId, entries]) => {
    const puzzle = puzzlesCache.find((p) => p.id === puzzleId);
    if (Array.isArray(entries)) {
      entries.forEach((e) => {
        allEntries.push({
          ...e,
          puzzleId,
          puzzleTitle: puzzle?.title || "Teka-teki (" + puzzleId + ")",
        });
      });
    }
  });
  allEntries.sort((a, b) => {
    const ta = a.timeMs > 0 ? a.timeMs : Number.MAX_SAFE_INTEGER;
    const tb = b.timeMs > 0 ? b.timeMs : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    const sa = Number(a.score) || 0;
    const sb = Number(b.score) || 0;
    if (sb !== sa) return sb - sa;
    return (Number(b.completedAt) || 0) - (Number(a.completedAt) || 0);
  });
  res.json({ success: true, data: allEntries });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat leaderboard." });
  }
});

// 16. Admin - Delete Suspicious Leaderboard Entry
app.delete("/api/admin/leaderboards/:puzzleId/:id", requireAdminAuth, (req, res) => {
  const { puzzleId, id } = req.params;
  if (leaderboardsCache[puzzleId]) {
    leaderboardsCache[puzzleId] = leaderboardsCache[puzzleId].filter((e: any) => e.id !== id);
    writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
  }
  res.json({ success: true, message: "Rekor skor leaderboard berhasil dihapus." });
});

// 17. Public Announcement & Admin Announcement Management
app.get("/api/announcement", (req, res) => {
  res.json({ success: true, data: announcementCache });
});

app.get("/api/admin/announcement", requireAdminAuth, (req, res) => {
  res.json({ success: true, data: announcementCache });
});

app.post("/api/admin/announcement", requireAdminAuth, (req, res) => {
  const { message, isActive, type } = req.body;
  announcementCache = {
    message: String(message || "").trim(),
    isActive: Boolean(isActive),
    type: type || "info",
    updatedAt: Date.now(),
  };
  writeJsonFile(ANNOUNCEMENT_FILE, announcementCache);
  res.json({ success: true, message: "Pengumuman global berhasil diperbarui!", data: announcementCache });
});

// --- VITE DEV & PRODUCTION SERVING ---
let supabaseInitStarted = false;

app.use((req, res, next) => {
  if (!supabaseInitStarted) {
    supabaseInitStarted = true;
    initSupabaseData().catch((e) => console.warn("[Supabase] Lazy sync note:", e));
  }
  next();
});

async function startServer() {
  // If running in Vercel serverless functions, do not start local listening loop
  if (process.env.VERCEL) {
    return;
  }

  // Sync with Supabase on startup
  await initSupabaseData();

  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn("Could not start Vite dev middleware:", e);
    }
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cloud Server running on port ${PORT}`);
  });
}

startServer();

export default app;
