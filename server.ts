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
  deleteLeaderboardEntryFromSupabase,
  fetchUserAccountsFromSupabase,
  upsertUserAccountToSupabase,
  fetchProfilesFromSupabase,
  upsertProfileToSupabase,
  getRuntimeSupabaseConfig,
  saveRuntimeSupabaseConfig,
  upsertPresenceHeartbeat,
  getPresenceStatsFromSupabase,
} from "./lib/supabase.js";

const app = express();
const PORT = 3000;

// Matikan ETag: mencegah 304 menahan data admin/API yang sudah basi antar instance Vercel
app.set("etag", false);

// Enable HTTP response compression for high throughput & low bandwidth latency
app.use(compression());

// CORS & HTTP Headers Setup for browser and API requests
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token, Accept, x-author-id, x-sync-key, *");
  res.setHeader("Access-Control-Max-Age", "86400");

  // API dinamis: jangan di-cache browser/CDN (hindari 304 dengan body kosong/basi)
  if (req.path.startsWith("/api") || req.url?.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.removeHeader("ETag");
  }

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

// SECURITY: Do NOT accept Supabase credentials from public request headers.
// Config only via env vars or admin-only /api/admin/supabase-config endpoint.


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

/* ============================================================
   SECURITY HELPERS: auth resolution, rate limit, sanitization
   ============================================================ */

/**
 * Ensure user accounts are loaded from Supabase (cold-start safe).
 * IMPORTANT: only skipping the refetch when the cache is fully empty is not
 * enough on Vercel — a "warm" instance can hold a partial cache from earlier
 * requests that predates a brand-new registration/login on a different
 * instance. When `req` is passed, we also force a refresh if the specific
 * account this request claims to be isn't present yet.
 */
async function ensureUserAccountsLoaded(req?: express.Request): Promise<void> {
  try {
    const cacheEmpty = Object.keys(userAccountsCache).length === 0;

    let candidateMissing = false;
    if (req) {
      const authorId = String(req.headers["x-author-id"] || "").trim();
      const authHeader = (req.headers.authorization || "") as string;
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : "";
      if (authorId && !userAccountsCache[authorId]) candidateMissing = true;
      if (!candidateMissing && bearer && !bearer.startsWith("adm_")) {
        const known = Object.values(userAccountsCache).some(
          (acc: any) => acc && typeof acc === "object" && acc.authToken === bearer
        );
        if (!known) candidateMissing = true;
      }
    }

    if (!cacheEmpty && !candidateMissing) return;
    const sbAccounts = await fetchUserAccountsFromSupabase();
    if (sbAccounts && Object.keys(sbAccounts).length > 0) {
      userAccountsCache = { ...userAccountsCache, ...sbAccounts };
      writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);
    }
  } catch (e) {
    console.warn("[auth] ensureUserAccountsLoaded note:", e);
  }
}

/** Resolve authenticated user from Bearer token or known account + sync key */
function resolveAuthUser(req: express.Request): {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  authToken?: string;
} | null {
  const authHeader = (req.headers.authorization || "") as string;
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : "";

  if (token && !token.startsWith("adm_")) {
    // Match token against in-memory accounts
    for (const acc of Object.values(userAccountsCache)) {
      if (acc && typeof acc === "object" && acc.authToken === token) {
        return {
          id: String(acc.id || ""),
          email: acc.email ? String(acc.email) : undefined,
          name: acc.name ? String(acc.name) : undefined,
          avatar: acc.avatar ? String(acc.avatar) : undefined,
          authToken: token,
        };
      }
    }
  }

  // Fallback: x-author-id MUST be paired with matching x-sync-key from a known account.
  // Bare x-author-id alone is NOT trusted (prevents spoofed deletes/updates).
  const authorId = String(req.headers["x-author-id"] || "").trim();
  const syncKey = String(req.headers["x-sync-key"] || "").trim();
  if (authorId && syncKey) {
    const byId = userAccountsCache[authorId];
    if (byId && typeof byId === "object" && byId.syncKey && String(byId.syncKey) === syncKey) {
      return {
        id: String(byId.id || authorId),
        email: byId.email ? String(byId.email) : undefined,
        name: byId.name ? String(byId.name) : undefined,
        avatar: byId.avatar ? String(byId.avatar) : undefined,
      };
    }
    // Also scan by syncKey match across accounts (cold instance may key by email)
    for (const acc of Object.values(userAccountsCache)) {
      if (
        acc &&
        typeof acc === "object" &&
        String(acc.id || "") === authorId &&
        acc.syncKey &&
        String(acc.syncKey) === syncKey
      ) {
        return {
          id: String(acc.id || authorId),
          email: acc.email ? String(acc.email) : undefined,
          name: acc.name ? String(acc.name) : undefined,
          avatar: acc.avatar ? String(acc.avatar) : undefined,
        };
      }
    }
  }

  return null;
}

/** Require that requester is the puzzle author (or admin). Strict: missing identity = deny. */
function assertPuzzleAuthor(
  puzzle: any,
  req: express.Request
): { ok: true; user: { id: string } } | { ok: false; status: number; message: string } {
  const user = resolveAuthUser(req);
  if (!user || !user.id) {
    return {
      ok: false,
      status: 401,
      message: "Akses ditolak: autentikasi diperlukan. Login atau sertakan Authorization / x-author-id.",
    };
  }
  const authorId = puzzle?.authorId ? String(puzzle.authorId) : "";
  if (authorId && authorId !== user.id) {
    // Allow admin token as override
    const adminTok =
      (req.headers.authorization || "").startsWith("Bearer ")
        ? (req.headers.authorization as string).substring(7)
        : (req.headers["x-admin-token"] as string) || "";
    if (adminTok && verifyAdminToken(adminTok)) {
      return { ok: true, user };
    }
    return {
      ok: false,
      status: 403,
      message: "Akses ditolak: Anda tidak memiliki izin untuk mengubah/menghapus teka-teki milik pemain lain.",
    };
  }
  return { ok: true, user };
}

/** Simple in-memory sliding-window rate limiter (per instance; better than nothing on serverless) */
const rateBuckets = new Map<string, number[]>();

function checkRateLimit(
  key: string,
  maxHits: number,
  windowMs: number
): boolean {
  const now = Date.now();
  let hits = rateBuckets.get(key) || [];
  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    rateBuckets.set(key, hits);
    return false; // limited
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  // opportunistic cleanup
  if (rateBuckets.size > 5000) {
    const cutoff = now - windowMs * 2;
    for (const [k, arr] of rateBuckets) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length === 0) rateBuckets.delete(k);
      else rateBuckets.set(k, kept);
    }
  }
  return true;
}

function clientIp(req: express.Request): string {
  const xf = (req.headers["x-forwarded-for"] as string) || "";
  return (xf.split(",")[0] || req.socket?.remoteAddress || "unknown").trim();
}

/** Sanitize user-generated comment text */
function sanitizeCommentContent(raw: any): string {
  let s = String(raw ?? "");
  // strip HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // neutralize common XSS vectors
  s = s.replace(/[<>]/g, "");
  s = s.replace(/javascript\s*:/gi, "");
  s = s.replace(/on\w+\s*=/gi, "");
  // normalize whitespace
  s = s.replace(/\s+/g, " ").trim();
  // hard length cap
  if (s.length > 500) s = s.slice(0, 500);
  return s;
}

// Helper to ensure puzzles have reaction and comments containers
/** Play stats disimpan di userReactions.__ttsMeta agar tahan di kolom JSONB yang sudah ada */
function extractPlayMeta(p: any): {
  playsCount: number;
  completionsCount: number;
  lastPlayerName?: string;
  lastPlayerAvatar?: string;
  lastPlayerId?: string;
  lastPlayedAt?: number;
} {
  const ur = p?.userReactions || p?.user_reactions || {};
  const meta = (ur && typeof ur === "object" && ur.__ttsMeta && typeof ur.__ttsMeta === "object")
    ? ur.__ttsMeta
    : {};
  const data = p?.data && typeof p.data === "object" ? p.data : {};
  return {
    playsCount:
      Number(p?.playsCount ?? p?.plays_count ?? meta.playsCount ?? data.playsCount ?? 0) || 0,
    completionsCount:
      Number(p?.completionsCount ?? p?.completions_count ?? meta.completionsCount ?? data.completionsCount ?? 0) || 0,
    lastPlayerName: p?.lastPlayerName || p?.last_player_name || meta.lastPlayerName || data.lastPlayerName || undefined,
    lastPlayerAvatar: p?.lastPlayerAvatar || p?.last_player_avatar || meta.lastPlayerAvatar || data.lastPlayerAvatar || undefined,
    lastPlayerId: p?.lastPlayerId || p?.last_player_id || meta.lastPlayerId || data.lastPlayerId || undefined,
    lastPlayedAt: Number(p?.lastPlayedAt ?? p?.last_played_at ?? meta.lastPlayedAt ?? data.lastPlayedAt ?? 0) || undefined,
  };
}

function withPlayMetaEmbedded(puzzle: any): any {
  const meta = {
    playsCount: Number(puzzle.playsCount) || 0,
    completionsCount: Number(puzzle.completionsCount) || 0,
    lastPlayerName: puzzle.lastPlayerName || null,
    lastPlayerAvatar: puzzle.lastPlayerAvatar || null,
    lastPlayerId: puzzle.lastPlayerId || null,
    lastPlayedAt: puzzle.lastPlayedAt || null,
  };
  const ur = { ...(puzzle.userReactions || {}) };
  ur.__ttsMeta = meta;
  return { ...puzzle, userReactions: ur };
}

function normalizePuzzle(p: any): any {
  const play = extractPlayMeta(p);
  const urRaw = p.userReactions || p.user_reactions || {};
  let clues = p.clues;
  if (!Array.isArray(clues)) {
    if (clues && typeof clues === "object") {
      const across = Array.isArray(clues.across) ? clues.across : [];
      const down = Array.isArray(clues.down) ? clues.down : [];
      clues = [...across, ...down];
    } else {
      clues = [];
    }
  }
  const grid = Array.isArray(p.grid) ? p.grid : [];
  return {
    ...p,
    grid,
    clues,
    width: Number(p.width) || (grid[0] ? grid[0].length : 10) || 10,
    height: Number(p.height) || grid.length || 10,
    reactions: p.reactions || {
      like: 0,
      laugh: 0,
      love: 0,
      think: 0,
      fire: 0,
      sad: 0,
    },
    userReactions: urRaw && typeof urRaw === "object" ? urRaw : {},
    comments: Array.isArray(p.comments) ? p.comments : [],
    playsCount: play.playsCount,
    completionsCount: play.completionsCount,
    lastPlayerName: play.lastPlayerName,
    lastPlayerAvatar: play.lastPlayerAvatar,
    lastPlayerId: play.lastPlayerId,
    lastPlayedAt: play.lastPlayedAt,
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

    // 1. Sync Puzzles — Supabase is source of truth when fetch succeeds
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles !== null && sbPuzzles.length > 0) {
      // REPLACE (do not merge) so deleted TTS disappear from server cache
      puzzlesCache = sbPuzzles
        .map((p) => normalizePuzzle(p))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
      console.log(`[Supabase] Berhasil memuat ${sbPuzzles.length} teka-teki dari Supabase (replace cache).`);
    } else if (sbPuzzles !== null && sbPuzzles.length === 0 && puzzlesCache.length > 0) {
      // Tabel Supabase masih kosong: seed sekali dari cache lokal
      console.log(`[Supabase] Mengunggah ${puzzlesCache.length} teka-teki lokal ke tabel Supabase...`);
      for (const p of puzzlesCache) {
        await upsertPuzzleToSupabase(p);
      }
    } else if (sbPuzzles === null) {
      console.log(`[Supabase] Fetch puzzles gagal; memakai cache lokal (${puzzlesCache.length}).`);
    } else {
      // sb empty and local empty
      puzzlesCache = [];
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
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

// --- SITE PRESENCE (Supabase-backed; local /tmp only as emergency fallback) ---
app.post("/api/presence/heartbeat", async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || "").trim().slice(0, 80);
    const countVisit = Boolean(req.body?.countVisit);
    const userId = req.body?.userId ? String(req.body.userId).slice(0, 80) : null;
    const name = req.body?.name ? String(req.body.name).slice(0, 40) : null;
    const avatar = req.body?.avatar ? String(req.body.avatar).slice(0, 16) : null;
    const now = Date.now();

    if (!clientId) {
      return res.status(400).json({ success: false, message: "clientId wajib." });
    }

    // Prefer Supabase (shared across all Vercel instances)
    const sb = await upsertPresenceHeartbeat({
      clientId,
      userId,
      name,
      avatar,
      countVisit,
    });
    if (sb) {
      return res.json({
        success: true,
        totalVisits: sb.totalVisits,
        online: Math.max(sb.online, 1),
        source: "supabase",
      });
    }

    // Fallback: in-memory + /tmp (single-instance only)
    if (!presenceStore.online) presenceStore.online = {};
    if (typeof presenceStore.totalVisits !== "number") presenceStore.totalVisits = 0;
    presenceStore.online[clientId] = now;
    if (countVisit) {
      presenceStore.totalVisits = Math.max(0, presenceStore.totalVisits) + 1;
    }
    const online = pruneOnlineClients(now);
    persistPresence();
    res.json({
      success: true,
      totalVisits: presenceStore.totalVisits,
      online: Math.max(online, 1),
      source: "local-fallback",
    });
  } catch (err) {
    console.warn("[presence] heartbeat error:", err);
    res.status(500).json({ success: false, message: "Gagal memperbarui presence." });
  }
});

app.get("/api/presence/stats", async (req, res) => {
  try {
    const sb = await getPresenceStatsFromSupabase();
    if (sb) {
      return res.json({
        success: true,
        totalVisits: sb.totalVisits,
        online: sb.online,
        source: "supabase",
      });
    }
    const online = pruneOnlineClients();
    res.json({
      success: true,
      totalVisits: presenceStore.totalVisits || 0,
      online,
      source: "local-fallback",
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
// Supabase is the source of truth when available (so deletes stick)
app.get("/api/puzzles", async (req, res) => {
  try {
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles !== null) {
      const prevById = new Map(puzzlesCache.map((p) => [p.id, p]));
      puzzlesCache = sbPuzzles
        .map((p) => {
          const n = normalizePuzzle(p);
          const prev = prevById.get(n.id);
          // Ambil plays/lastPlayer tertinggi (hindari regression 0 setelah cold refresh)
          if (prev) {
            const prevPlays = Number(prev.playsCount) || 0;
            const nPlays = Number(n.playsCount) || 0;
            if (prevPlays > nPlays) {
              n.playsCount = prevPlays;
              n.lastPlayerName = prev.lastPlayerName || n.lastPlayerName;
              n.lastPlayerAvatar = prev.lastPlayerAvatar || n.lastPlayerAvatar;
              n.lastPlayerId = prev.lastPlayerId || n.lastPlayerId;
              n.lastPlayedAt = prev.lastPlayedAt || n.lastPlayedAt;
            } else if (prevPlays === nPlays && prev.lastPlayedAt && n.lastPlayedAt) {
              if (Number(prev.lastPlayedAt) > Number(n.lastPlayedAt)) {
                n.lastPlayerName = prev.lastPlayerName || n.lastPlayerName;
                n.lastPlayerAvatar = prev.lastPlayerAvatar || n.lastPlayerAvatar;
                n.lastPlayerId = prev.lastPlayerId || n.lastPlayerId;
                n.lastPlayedAt = prev.lastPlayedAt;
              }
            }
          }
          return n;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
    }
  } catch (err) {
    console.warn("[API] /puzzles Supabase refresh note:", err);
  }

  // Enrich author avatar/name from live profiles
  const enriched = puzzlesCache.map((p) => {
    const pid = p.authorId;
    if (pid && profilesCache[pid]) {
      const pr = profilesCache[pid];
      return {
        ...p,
        authorAvatar: pr.avatar || p.authorAvatar || "🦊",
        authorName: pr.name || p.authorName,
      };
    }
    return p;
  });
  const sorted = [...enriched]
    .filter((p) => p && !p.isDraft)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Lightweight list payload: omit full grid (hydrate via GET /api/puzzles/:id on play)
  // Keep clues so community cards can show soal counts without a second request.
  const light = sorted.map((p) => {
    const { grid, ...rest } = p;
    return {
      ...rest,
      // tiny marker so clients know detail may need hydration
      grid: undefined,
      hasFullGrid: Array.isArray(grid) && grid.length > 0,
      cluesCount: Array.isArray(p.clues) ? p.clues.length : 0,
    };
  });

  res.json({
    success: true,
    data: light,
  });
});

// GET puzzle by ID or custom code (refresh from Supabase when possible)
app.get("/api/puzzles/:query", async (req, res) => {
  try {
    const sbPuzzles = await fetchPuzzlesFromSupabase();
    if (sbPuzzles !== null) {
      // REPLACE so a deleted puzzle is not still served from stale cache
      puzzlesCache = sbPuzzles.map((p) => normalizePuzzle(p));
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
app.post("/api/puzzles", async (req, res) => {
  try {
    const puzzle = req.body;
    if (!puzzle || !puzzle.id || !puzzle.title || !puzzle.grid || !puzzle.clues) {
      return res.status(400).json({ success: false, message: "Data teka-teki tidak lengkap." });
    }

    // Rate limit publish/update
    const ip = clientIp(req);
    if (!checkRateLimit(`publish:${ip}`, 20, 60_000)) {
      return res.status(429).json({ success: false, message: "Terlalu banyak permintaan. Coba lagi sebentar." });
    }

    // Prefer Supabase as source of truth for existing puzzle
    let existing: any = puzzlesCache.find((p) => p.id === puzzle.id) || null;
    if (!existing) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles) {
          existing = sbPuzzles.find((p: any) => p.id === puzzle.id) || null;
          if (existing) existing = normalizePuzzle(existing);
        }
      } catch { /* ignore */ }
    }

    await ensureUserAccountsLoaded(req);
    const authUserResolved = resolveAuthUser(req);

    // Security: update existing → must be verified author (strict)
    if (existing && existing.authorId) {
      const check = assertPuzzleAuthor(existing, req);
      if (check.ok === false) {
        return res.status(check.status).json({ success: false, message: check.message });
      }
    } else if (!existing) {
      // H3: New publish requires verified login (Bearer token or x-author-id + x-sync-key)
      // Do NOT trust puzzle.authorId from body alone
      if (!authUserResolved?.id) {
        return res.status(401).json({
          success: false,
          message: "Akses ditolak: login diperlukan untuk mempublikasikan teka-teki. Silakan masuk akun terlebih dahulu.",
        });
      }
    }

    const now = Date.now();
    const resolvedAuthorId =
      (existing && existing.authorId) ||
      (authUserResolved && authUserResolved.id) ||
      null;

    if (!resolvedAuthorId) {
      return res.status(401).json({
        success: false,
        message: "Akses ditolak: identitas penulis tidak terverifikasi.",
      });
    }

    const updatedPuzzle = {
      ...puzzle,
      updatedAt: now,
      createdAt: puzzle.createdAt || (existing ? existing.createdAt : now),
      authorId: resolvedAuthorId,
      authorName: (authUserResolved && authUserResolved.name) || puzzle.authorName || (existing && existing.authorName) || "Pemain TTS",
      authorAvatar: (authUserResolved && authUserResolved.avatar) || puzzle.authorAvatar || (existing && existing.authorAvatar) || "🦊",
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

    const index = puzzlesCache.findIndex((p) => p.id === puzzle.id);
    if (index >= 0) {
      puzzlesCache[index] = updatedPuzzle;
    } else {
      puzzlesCache.unshift(updatedPuzzle);
    }

    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    // Await Supabase upsert so serverless cold starts see the data
    const ok = await upsertPuzzleToSupabase(updatedPuzzle);
    if (!ok) {
      console.warn("[Supabase] Upsert puzzle gagal (tetap disimpan lokal/cache):", puzzle.id);
    }

    res.json({
      success: true,
      message: "Teka-teki berhasil dipublikasikan ke Cloud Database!",
      data: updatedPuzzle,
      persisted: ok,
    });
  } catch (error: any) {
    console.error("Error saving puzzle:", error);
    res.status(500).json({ success: false, message: "Gagal menyimpan teka-teki ke database." });
  }
});

// POST /api/puzzles/batch-sync: update existing puzzles only (NO insert of "missing" local copies).
// Inserting arbitrary client puzzles revived deleted TTS; publish must go through POST /api/puzzles.
app.post("/api/puzzles/batch-sync", async (req, res) => {
  try {
    const { puzzles } = req.body;
    if (!Array.isArray(puzzles) || puzzles.length === 0) {
      return res.json({ success: true, count: puzzlesCache.length, addedCount: 0, updatedCount: 0 });
    }

    let updatedCount = 0;
    let persistFailures = 0;
    const toPersist: any[] = [];

    puzzles.forEach((p) => {
      if (p && p.id && p.title && !p.isDraft) {
        const idx = puzzlesCache.findIndex((x) => x.id === p.id);
        if (idx === -1) {
          // Do NOT re-insert puzzles that are absent from server/Supabase (may have been deleted)
          return;
        }
        // Preserve server reactions and comments; refresh content from client
        puzzlesCache[idx] = {
          ...normalizePuzzle(p),
          reactions: puzzlesCache[idx].reactions || p.reactions,
          userReactions: puzzlesCache[idx].userReactions || p.userReactions || {},
          comments: puzzlesCache[idx].comments || p.comments || [],
        };
        updatedCount++;
        toPersist.push(puzzlesCache[idx]);
      }
    });

    if (updatedCount > 0) {
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
    }

    // AWAITED — previously fire-and-forget (.catch(() => {})), which on
    // serverless risked being cut off before the write reached Supabase.
    for (const p of toPersist) {
      try {
        const ok = await upsertPuzzleToSupabase(p);
        if (!ok) persistFailures++;
      } catch (e) {
        console.warn("[batch-sync] puzzle upsert to Supabase failed:", p.id, e);
        persistFailures++;
      }
    }

    res.json({
      success: persistFailures === 0,
      addedCount: 0,
      updatedCount,
      totalCount: puzzlesCache.length,
      persistFailures,
      message:
        persistFailures > 0
          ? `${persistFailures} dari ${toPersist.length} puzzle gagal dikonfirmasi ke Supabase.`
          : undefined,
    });
  } catch (err) {
    console.error("Error batch syncing puzzles:", err);
    res.status(500).json({ success: false, message: "Gagal batch sync puzzles." });
  }
});

// POST reaction to a crossword puzzle (like, laugh, love, think, fire, sad)
// Requirement: Only logged-in users and properly accumulated per user

// POST /api/puzzles/:id/play — increment playsCount (public, rate-light via client session)
app.post("/api/puzzles/:id/play", async (req, res) => {
  try {
    const { id } = req.params;
    const ip = clientIp(req);
    // Max 30 play events per IP per minute (client also dedupes per session)
    if (!checkRateLimit(`play:${ip}:${id}`, 5, 60_000)) {
      return res.status(429).json({ success: false, message: "Play sudah tercatat. Tunggu sebentar." });
    }
    if (!checkRateLimit(`play-ip:${ip}`, 40, 60_000)) {
      return res.status(429).json({ success: false, message: "Terlalu banyak permintaan." });
    }
    let puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      // Refresh from Supabase once
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles && sbPuzzles.length > 0) {
          const map = new Map<string, any>();
          sbPuzzles.map((p) => normalizePuzzle(p)).forEach((p) => map.set(p.id, p));
          puzzlesCache.forEach((p) => {
            if (!map.has(p.id)) map.set(p.id, normalizePuzzle(p));
          });
          puzzlesCache = Array.from(map.values());
          writeJsonFile(PUZZLES_FILE, puzzlesCache);
          puzzle = puzzlesCache.find((p) => p.id === id);
        }
      } catch {
        // ignore
      }
    }
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
    }

    const body = req.body || {};
    const playerName = String(body.playerName || body.name || "").trim();
    const playerAvatar = String(body.playerAvatar || body.avatar || "").trim() || "🦊";
    const playerId = body.playerId || body.userId || null;

    puzzle.playsCount = (Number(puzzle.playsCount) || 0) + 1;
    puzzle.updatedAt = Date.now();
    if (playerName) {
      puzzle.lastPlayerName = playerName;
      puzzle.lastPlayerAvatar = playerAvatar;
      puzzle.lastPlayerId = playerId || undefined;
      puzzle.lastPlayedAt = Date.now();
    }

    // Embed stats ke userReactions.__ttsMeta (kolom JSONB yang pasti ada)
    puzzle = withPlayMetaEmbedded(puzzle);

    const idx = puzzlesCache.findIndex((p) => p.id === id);
    if (idx >= 0) puzzlesCache[idx] = puzzle;
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    const ok = await upsertPuzzleToSupabase(puzzle);
    if (!ok) {
      console.warn("[play] Upsert Supabase gagal untuk", id);
    }

    res.json({
      success: true,
      playsCount: puzzle.playsCount,
      lastPlayerName: puzzle.lastPlayerName || null,
      lastPlayerAvatar: puzzle.lastPlayerAvatar || null,
      lastPlayedAt: puzzle.lastPlayedAt || null,
      persisted: ok,
      message: "Play tercatat.",
    });
  } catch (error) {
    console.error("Error recording play:", error);
    res.status(500).json({ success: false, message: "Gagal mencatat play." });
  }
});


app.post("/api/puzzles/:id/react", async (req, res) => {
  try {
    const { id } = req.params;
    const { reactionType, previousReaction } = req.body;
    const ip = clientIp(req);
    if (!checkRateLimit(`react:${ip}`, 30, 60_000)) {
      return res.status(429).json({ success: false, message: "Terlalu banyak reaksi. Coba lagi sebentar." });
    }

    await ensureUserAccountsLoaded(req);
    // H2: only trust verified auth — never body.userId / bare x-author-id
    const authUser = resolveAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Hanya pengguna yang sudah login yang dapat memberikan reaksi.",
      });
    }

    const effectiveUserId = authUser.id;
    const validTypes = ["like", "laugh", "love", "think", "fire", "sad"];
    const userKey = String(effectiveUserId).toLowerCase();

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


// GET comments for a crossword puzzle (Supabase-first when possible)
app.get("/api/puzzles/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    let puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles) {
          const found = sbPuzzles.find((p: any) => p.id === id);
          if (found) {
            puzzle = normalizePuzzle(found);
            const idx = puzzlesCache.findIndex((x) => x.id === id);
            if (idx >= 0) puzzlesCache[idx] = puzzle;
            else puzzlesCache.push(puzzle);
            writeJsonFile(PUZZLES_FILE, puzzlesCache);
          }
        }
      } catch { /* ignore */ }
    }
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
    }
    res.json({
      success: true,
      data: puzzle.comments || [],
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal memuat komentar." });
  }
});

// POST add comment to a crossword puzzle
// Requirement: Only logged-in users
app.post("/api/puzzles/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorName, authorAvatar, authorId, authorEmail, content } = req.body;
    const ip = clientIp(req);
    if (!checkRateLimit(`comment:${ip}`, 10, 60_000)) {
      return res.status(429).json({ success: false, message: "Terlalu banyak komentar. Coba lagi sebentar." });
    }

    await ensureUserAccountsLoaded(req);
    // Only trust verified auth — never body.authorId alone
    const authUser = resolveAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Hanya pengguna yang sudah login yang dapat menulis komentar pada teka-teki silang.",
      });
    }
    const effectiveAuthorId = authUser.id;
    const effectiveEmail = authUser.email || authorEmail || '';

    const cleanContent = sanitizeCommentContent(content);
    if (!cleanContent) {
      return res.status(400).json({ success: false, message: "Isi komentar tidak boleh kosong." });
    }

    let puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles) {
          const found = sbPuzzles.find((p: any) => p.id === id);
          if (found) {
            puzzle = normalizePuzzle(found);
            const idx = puzzlesCache.findIndex((p) => p.id === id);
            if (idx >= 0) puzzlesCache[idx] = puzzle;
            else puzzlesCache.push(puzzle);
          }
        }
      } catch { /* ignore */ }
    }
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki silang tidak ditemukan." });
    }

    if (!puzzle.comments) {
      puzzle.comments = [];
    }

    // Cap comments per puzzle to prevent unbounded growth
    if (puzzle.comments.length >= 200) {
      return res.status(400).json({ success: false, message: "Batas komentar untuk teka-teki ini sudah tercapai." });
    }

    const safeName = sanitizeCommentContent(authorName || (authUser && authUser.name) || "Pemain TTS").slice(0, 40) || "Pemain TTS";
    const newComment = {
      id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      puzzleId: id,
      authorName: safeName,
      authorAvatar: (authorAvatar || (authUser && authUser.avatar) || '🦊').toString().slice(0, 16),
      authorId: effectiveAuthorId || '',
      authorEmail: effectiveEmail || '',
      content: cleanContent,
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
      persisted: ok,
    });
  } catch (error) {
    console.error("Error adding comment to puzzle:", error);
    res.status(500).json({ success: false, message: "Gagal menambahkan komentar." });
  }
});

// DELETE a comment from a crossword puzzle — only comment author, puzzle author, or admin
app.delete("/api/puzzles/:id/comments/:commentId", async (req, res) => {
  try {
    const { id, commentId } = req.params;
    let puzzle = puzzlesCache.find((p) => p.id === id);
    if (!puzzle) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles) {
          const found = sbPuzzles.find((p: any) => p.id === id);
          if (found) puzzle = normalizePuzzle(found);
        }
      } catch { /* ignore */ }
    }
    if (!puzzle) {
      return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
    }

    const comments: any[] = Array.isArray(puzzle.comments) ? puzzle.comments : [];
    const target = comments.find((c) => c && c.id === commentId);
    if (!target) {
      return res.status(404).json({ success: false, message: "Komentar tidak ditemukan." });
    }

    await ensureUserAccountsLoaded(req);
    const user = resolveAuthUser(req);
    const adminTok =
      (req.headers.authorization || "").startsWith("Bearer ")
        ? (req.headers.authorization as string).substring(7)
        : (req.headers["x-admin-token"] as string) || "";
    const isAdmin = !!(adminTok && verifyAdminToken(adminTok));
    const isCommentAuthor = !!(user?.id && target.authorId && String(target.authorId) === user.id);
    const isPuzzleAuthor = !!(user?.id && puzzle.authorId && String(puzzle.authorId) === user.id);

    if (!isAdmin && !isCommentAuthor && !isPuzzleAuthor) {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak: hanya penulis komentar, pemilik teka-teki, atau admin yang dapat menghapus.",
      });
    }

    puzzle.comments = comments.filter((c: any) => c.id !== commentId);
    const idx = puzzlesCache.findIndex((p) => p.id === id);
    if (idx >= 0) puzzlesCache[idx] = puzzle;
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    // PENTING: cek hasil upsert ke Supabase. Sebelumnya selalu
    // res.json({success:true}) TANPA PEDULI hasil upsert ini — akibatnya
    // fix rollback di client (PuzzleInteractions.tsx) tidak pernah
    // terpicu untuk kegagalan Supabase, karena server sendiri berbohong
    // bilang sukses. Komentar yang gagal terhapus di Supabase akan
    // MUNCUL LAGI begitu puzzle di-fetch ulang.
    const persisted = await upsertPuzzleToSupabase(puzzle).catch(() => false);

    res.json({
      success: persisted,
      message: persisted
        ? "Komentar berhasil dihapus."
        : "Gagal menyimpan penghapusan komentar ke Supabase. Coba lagi.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menghapus komentar." });
  }
});

// DELETE a puzzle from cloud database
app.delete("/api/puzzles/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let puzzle = puzzlesCache.find((p) => p.id === id);

    // Prefer Supabase as source of truth (handles stale serverless instances)
    if (!puzzle) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles) {
          const found = sbPuzzles.find((p: any) => p.id === id);
          if (found) puzzle = normalizePuzzle(found);
        }
      } catch {
        // ignore
      }
    }

    if (!puzzle) {
      // Puzzle already gone — require auth so random clients cannot probe deletes
      await ensureUserAccountsLoaded(req);
      const user = resolveAuthUser(req);
      if (!user?.id) {
        return res.status(401).json({
          success: false,
          message: "Akses ditolak: autentikasi diperlukan untuk menghapus teka-teki.",
        });
      }
      await deletePuzzleFromSupabase(id).catch(() => {});
      puzzlesCache = puzzlesCache.filter((p) => p.id !== id);
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      if (leaderboardsCache[id]) {
        delete leaderboardsCache[id];
        writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
      }
      return res.json({ success: true, message: "Teka-teki dihapus dari cloud database (jika ada)." });
    }

    // STRICT: author must be authenticated and match (or admin)
    await ensureUserAccountsLoaded(req);
    const check = assertPuzzleAuthor(puzzle, req);
    if (check.ok === false) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    puzzlesCache = puzzlesCache.filter((p) => p.id !== id);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    // PENTING: cek hasil delete di Supabase — sebelumnya selalu
    // res.json({success:true}) TANPA PEDULI hasilnya. Ini adalah rute
    // yang jadi dasar rollback-on-failure di CommunityView.tsx
    // (handleConfirmDelete) — kalau server berbohong bilang sukses,
    // rollback client itu TIDAK PERNAH terpicu untuk kegagalan Supabase
    // asli, dan puzzle akan tetap live & publik walau pemiliknya
    // mengira sudah terhapus.
    const deletedFromSupabase = await deletePuzzleFromSupabase(id).catch(() => false);

    if (leaderboardsCache[id]) {
      delete leaderboardsCache[id];
      writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
    }

    res.json({
      success: deletedFromSupabase,
      message: deletedFromSupabase
        ? "Teka-teki dan peringkat terkait berhasil dihapus dari cloud database."
        : "Gagal menghapus teka-teki dari Supabase. Coba lagi.",
    });
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
    // null = fetch failed → keep existing cache
    if (sb === null) return;
    // Successful fetch (even empty): REPLACE cache so deletes stick & cold instances fill
    leaderboardsCache = {};
    for (const [pId, entries] of Object.entries(sb)) {
      if (!Array.isArray(entries)) continue;
      leaderboardsCache[pId] = sortLeaderboardEntries(entries).slice(0, 100);
    }
    writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
  } catch (err) {
    console.warn("[leaderboard] Supabase replace note:", err);
  }
}


// GET all leaderboard entries (Global) — Supabase source of truth
app.get("/api/leaderboards", async (req, res) => {
  try {
    await ensureLeaderboardsFromSupabase();

    let activePuzzleIds = new Set(puzzlesCache.map((p) => p.id));
    if (activePuzzleIds.size === 0) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        if (sbPuzzles?.length) {
          puzzlesCache = sbPuzzles.map((p: any) => normalizePuzzle(p));
          sbPuzzles.forEach((p: any) => activePuzzleIds.add(p.id));
        }
      } catch { /* ignore */ }
    }

    const allEntries: any[] = [];
    Object.entries(leaderboardsCache).forEach(([puzzleId, entries]) => {
      if ((!activePuzzleIds.size || activePuzzleIds.has(puzzleId)) && Array.isArray(entries)) {
        allEntries.push(...entries.map((e) => ({ ...e, puzzleId: e.puzzleId || puzzleId })));
      }
    });

    const sorted = sortLeaderboardEntries(allEntries);
    res.json({ success: true, data: sorted.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data peringkat global." });
  }
});

// GET leaderboard entries for a specific puzzle — Supabase source of truth
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

// POST submit a leaderboard entry — persist to Supabase first
// Patch: wajib login, validasi timeMs, identitas dari auth (anti-cheat ringan)
// Mirrors src/services/gridBuilder.ts calculateScore() — MUST stay identical
// so client-side score preview matches what the server actually stores.
function calculateScoreServer(timeMs: number, cellsCount: number = 25): number {
  if (timeMs <= 0) return 0;
  const seconds = Math.max(1, Math.floor(timeMs / 1000));
  const basePoints = Math.max(1500, cellsCount * 120);
  const speedBonus = Math.max(100, Math.round(180000 / (seconds + 20)));
  const finalScore = basePoints + speedBonus;
  return Math.max(250, finalScore);
}

function countFilledCells(grid: any): number {
  if (!Array.isArray(grid)) return 25;
  let count = 0;
  for (const row of grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (cell !== null && cell !== "") count++;
    }
  }
  return count > 0 ? count : 25;
}

/* ============================================================
   GENERATOR TTS OTOMATIS (Admin) — Groq (kata & clue) + penyusun
   grid crossword lokal (murni algoritma, tidak butuh AI).
   ============================================================ */

interface WordClueInput {
  word: string;
  clue: string;
}

interface PlacedWord {
  word: string;
  clue: string;
  row: number;
  col: number;
  dir: "across" | "down";
}

/**
 * Memanggil Groq (kompatibel format OpenAI) untuk menghasilkan pasangan
 * kata+soal TTS berbahasa Indonesia sesuai topik bebas dari admin.
 */
async function generateWordsWithGroq(
  topic: string,
  count: number,
  apiKey: string,
  model: string
): Promise<WordClueInput[]> {
  const prompt = `Buat ${count} pasangan KATA dan SOAL (clue) untuk teka-teki silang (TTS) berbahasa Indonesia dengan topik: "${topic}".

Aturan WAJIB:
- Setiap kata HARUS satu kata tunggal (tanpa spasi/tanda baca), hanya huruf A-Z, panjang 3 sampai 10 huruf.
- Tidak boleh ada kata yang berulang atau bermakna sama.
- Soal (clue) singkat, jelas, berbahasa Indonesia, dan TIDAK menyebutkan jawabannya secara langsung.
- Variasikan panjang kata (campur pendek dan panjang) supaya grid TTS mudah disusun.
- Balas HANYA dengan JSON, tanpa teks lain, tanpa markdown code fence, dengan format persis:
{"words":[{"word":"CONTOH","clue":"Penjelasan singkat soal ini"}]}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // fallback: coba ekstrak array JSON dari teks kalau model tetap membungkus dengan penjelasan
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Respons AI bukan JSON yang valid.");
    parsed = JSON.parse(match[0]);
  }

  const rawList = Array.isArray(parsed) ? parsed : parsed?.words;
  if (!Array.isArray(rawList)) throw new Error("Format respons AI tidak sesuai (tidak ada daftar kata).");

  const seen = new Set<string>();
  const cleaned: WordClueInput[] = [];
  for (const item of rawList) {
    if (!item || typeof item.word !== "string" || typeof item.clue !== "string") continue;
    const word = item.word.toUpperCase().replace(/[^A-Z]/g, "");
    const clue = item.clue.trim().slice(0, 200);
    if (word.length < 3 || word.length > 10 || !clue) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    cleaned.push({ word, clue });
  }
  return cleaned;
}

/**
 * Menyusun daftar kata+soal menjadi grid TTS yang valid (saling silang),
 * murni algoritma lokal — tidak perlu AI untuk tahap ini.
 * Strategi: tempatkan kata terpanjang dulu, lalu cari persilangan huruf
 * yang valid untuk tiap kata berikutnya (harus ada minimal 1 persilangan,
 * sel sebelum/sesudah kata harus kosong, dan tetangga tegak lurus tidak
 * boleh bersinggungan tanpa sengaja dengan kata lain).
 */
function packCrossword(
  entries: WordClueInput[]
): { grid: (string | null)[][]; placements: PlacedWord[] } | null {
  const cleaned = entries
    .filter((e) => e.word.length >= 3 && e.word.length <= 10)
    .sort((a, b) => b.word.length - a.word.length);
  if (cleaned.length === 0) return null;

  const cells = new Map<string, string>();
  const placements: PlacedWord[] = [];
  const key = (r: number, c: number) => `${r},${c}`;

  function canPlace(word: string, row: number, col: number, dir: "across" | "down"): number | false {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    const br = row - dr;
    const bc = col - dc;
    if (cells.has(key(br, bc))) return false;

    let crossings = 0;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = cells.get(key(r, c));
      if (existing) {
        if (existing !== word[i]) return false;
        crossings++;
      } else {
        const pr1 = r + (dir === "across" ? 1 : 0);
        const pc1 = c + (dir === "across" ? 0 : 1);
        const pr2 = r - (dir === "across" ? 1 : 0);
        const pc2 = c - (dir === "across" ? 0 : 1);
        if (cells.has(key(pr1, pc1)) || cells.has(key(pr2, pc2))) return false;
      }
    }
    const er = row + dr * word.length;
    const ec = col + dc * word.length;
    if (cells.has(key(er, ec))) return false;

    if (placements.length === 0) return crossings; // kata pertama, bebas
    return crossings > 0 ? crossings : false; // wajib minimal 1 persilangan
  }

  function place(word: string, clue: string, row: number, col: number, dir: "across" | "down") {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      cells.set(key(row + dr * i, col + dc * i), word[i]);
    }
    placements.push({ word, clue, row, col, dir });
  }

  place(cleaned[0].word, cleaned[0].clue, 0, 0, "across");

  for (let idx = 1; idx < cleaned.length; idx++) {
    const { word, clue } = cleaned[idx];
    let best: { row: number; col: number; dir: "across" | "down"; score: number } | null = null;

    for (let li = 0; li < word.length; li++) {
      const letter = word[li];
      for (const [k, existingLetter] of cells) {
        if (existingLetter !== letter) continue;
        const [er, ec] = k.split(",").map(Number);
        for (const dir of ["across", "down"] as const) {
          const row = dir === "across" ? er : er - li;
          const col = dir === "across" ? ec - li : ec;
          const score = canPlace(word, row, col, dir);
          if (score !== false && (!best || score > best.score)) {
            best = { row, col, dir, score };
          }
        }
      }
    }

    if (best) {
      place(word, clue, best.row, best.col, best.dir);
    }
    // kalau tidak ada persilangan valid, kata ini dilewati (mengurangi
    // jumlah clue akhir, tapi mencegah grid yang rusak/tidak nyambung)
  }

  if (placements.length < 3) return null;

  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity;
  for (const k of cells.keys()) {
    const [r, c] = k.split(",").map(Number);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  const height = maxR - minR + 1;
  const width = maxC - minC + 1;
  const grid: (string | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  for (const [k, letter] of cells) {
    const [r, c] = k.split(",").map(Number);
    grid[r - minR][c - minC] = letter;
  }
  const normPlacements = placements.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }));

  return { grid, placements: normPlacements };
}

/**
 * Beri nomor cell (aturan crossword standar: scan baris demi baris) lalu
 * bentuk array `clues` dengan teks soal dari placement yang bersangkutan.
 * Format id konsisten dengan gridBuilder.ts (posisi saja, lihat catatan
 * di src/services/gridBuilder.ts terkait kompatibilitas mundur).
 */
function numberAndBuildClues(grid: (string | null)[][], placements: PlacedWord[]): any[] {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const cellNumbers: (number | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  let num = 1;
  const numberAt = (r: number, c: number): number => {
    if (cellNumbers[r][c] !== null) return cellNumbers[r][c] as number;
    cellNumbers[r][c] = num;
    return num++;
  };

  const clueTextMap = new Map<string, string>();
  placements.forEach((p) => clueTextMap.set(`${p.row},${p.col},${p.dir}`, p.clue));

  const clues: any[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === null) continue;
      const startsAcross = (c === 0 || grid[r][c - 1] === null) && c + 1 < width && grid[r][c + 1] !== null;
      const startsDown = (r === 0 || grid[r - 1][c] === null) && r + 1 < height && grid[r + 1][c] !== null;
      if (!startsAcross && !startsDown) continue;
      const n = numberAt(r, c);

      if (startsAcross) {
        let len = 0;
        while (c + len < width && grid[r][c + len] !== null) len++;
        clues.push({
          id: `across-${r}-${c}`,
          number: n,
          direction: "across",
          row: r,
          col: c,
          length: len,
          answer: Array.from({ length: len }, (_, i) => grid[r][c + i]).join(""),
          question: clueTextMap.get(`${r},${c},across`) || "",
        });
      }
      if (startsDown) {
        let len = 0;
        while (r + len < height && grid[r + len][c] !== null) len++;
        clues.push({
          id: `down-${r}-${c}`,
          number: n,
          direction: "down",
          row: r,
          col: c,
          length: len,
          answer: Array.from({ length: len }, (_, i) => grid[r + i][c]).join(""),
          question: clueTextMap.get(`${r},${c},down`) || "",
        });
      }
    }
  }
  return clues;
}

/** Marker khusus untuk membedakan draft hasil generate AI dari draft biasa */
const AI_GENERATED_AUTHOR_ID = "admin_ai_generated";

app.post("/api/leaderboard/:puzzleId", async (req, res) => {
  try {
    const puzzleId = req.params.puzzleId;
    const entry = req.body;
    const ip = clientIp(req);

    if (!checkRateLimit(`leaderboard:${ip}`, 20, 60_000)) {
      return res.status(429).json({
        success: false,
        message: "Terlalu banyak kiriman skor. Coba lagi sebentar.",
      });
    }

    await ensureUserAccountsLoaded(req);
    const authUser = resolveAuthUser(req);
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Login diperlukan untuk mengirim skor ke papan peringkat.",
      });
    }

    if (!entry || entry.timeMs === undefined) {
      return res.status(400).json({ success: false, message: "Data skor tidak valid." });
    }

    const timeMs = Math.floor(Number(entry.timeMs) || 0);
    // Anti-cheat ringan: terlalu cepat / terlalu lama ditolak
    const MIN_TIME_MS = 3_000; // 3 detik
    const MAX_TIME_MS = 24 * 60 * 60 * 1000; // 24 jam
    if (!(timeMs >= MIN_TIME_MS)) {
      return res.status(400).json({
        success: false,
        message: "Waktu pengerjaan tidak wajar (terlalu cepat).",
      });
    }
    if (timeMs > MAX_TIME_MS) {
      return res.status(400).json({
        success: false,
        message: "Waktu pengerjaan tidak wajar (terlalu lama).",
      });
    }

    await ensureLeaderboardsFromSupabase();

    const safeName =
      String(authUser.name || entry.playerName || "Pemain TTS")
        .trim()
        .slice(0, 40) || "Pemain TTS";
    const safeAvatar = String(
      authUser.avatar || entry.playerAvatar || "🦊"
    ).slice(0, 16);

    // Skor TIDAK dipercaya dari client — dihitung ulang di server dari timeMs
    // + jumlah sel terisi pada puzzle asli (mencegah skor palsu/inflasi).
    let puzzleForScore = puzzlesCache.find((p) => p.id === puzzleId);
    if (!puzzleForScore) {
      try {
        const sbPuzzles = await fetchPuzzlesFromSupabase();
        puzzleForScore = sbPuzzles?.find((p: any) => p.id === puzzleId);
      } catch {
        // ignore — fallback default cellsCount below
      }
    }
    const cellsCount = countFilledCells(puzzleForScore?.grid);
    const computedScore = calculateScoreServer(timeMs, cellsCount);

    const newEntry = {
      id: entry.id || "lead_" + Math.random().toString(36).substring(2, 11),
      puzzleId,
      playerName: safeName,
      playerAvatar: safeAvatar,
      // Identitas selalu dari auth terverifikasi — jangan percaya body.playerId
      playerId: authUser.id,
      playerEmail: authUser.email || entry.playerEmail || entry.email || null,
      timeMs,
      score: computedScore,
      formattedTime: entry.formattedTime || null,
      completedAt: Number(entry.completedAt) || Date.now(),
      puzzleTitle: entry.puzzleTitle ? String(entry.puzzleTitle).slice(0, 120) : null,
    };

    const saved = upsertLocalLeaderboardEntry(puzzleId, newEntry);

    // "Diselesaikan" (completionsCount) sebelumnya TIDAK PERNAH di-increment
    // di mana pun dalam kode — selalu tampil 0 di kartu statistik profil
    // kreator. Increment di sini, HANYA saat ini benar-benar penyelesaian
    // BARU oleh pemain ini untuk puzzle ini (bukan tiap kali dia resubmit
    // skor yang lebih baik pada puzzle yang sama), supaya angkanya
    // merepresentasikan jumlah penyelesaian unik, bukan jumlah submit.
    const isNewCompletion = saved.id === newEntry.id;
    if (isNewCompletion && puzzleForScore) {
      try {
        const pIdx = puzzlesCache.findIndex((p) => p.id === puzzleId);
        if (pIdx >= 0) {
          puzzlesCache[pIdx].completionsCount = (Number(puzzlesCache[pIdx].completionsCount) || 0) + 1;
          puzzlesCache[pIdx].updatedAt = Date.now();
          puzzlesCache[pIdx] = withPlayMetaEmbedded(puzzlesCache[pIdx]);
          writeJsonFile(PUZZLES_FILE, puzzlesCache);
          writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
          // Di-await (bukan fire-and-forget) untuk konsistensi dengan
          // perbaikan serupa di seluruh file ini — kalau gagal, backfill
          // (POST /api/admin/backfill-completions) tetap akan
          // memperbaikinya nanti karena entri leaderboard-nya sendiri
          // sudah berhasil tersimpan (dihitung ulang dari sana).
          const completionsPersisted = await upsertPuzzleToSupabase(puzzlesCache[pIdx]).catch(() => false);
          if (!completionsPersisted) {
            console.warn("[leaderboard] Gagal upsert completionsCount ke Supabase (akan self-heal via backfill):", puzzleId);
          }
        }
      } catch (e) {
        console.warn("[leaderboard] Gagal increment completionsCount:", puzzleId, e);
      }
    }

    const persistResult = await insertLeaderboardEntryToSupabase(puzzleId, saved);
    const persisted = Boolean(persistResult && (persistResult as any).ok);
    const persistError =
      typeof persistResult === "object" && persistResult !== null
        ? (persistResult as any).error
        : undefined;

    if (!persisted) {
      console.warn("[leaderboard] Upsert Supabase gagal untuk", puzzleId, saved.id, persistError);
    } else {
      await ensureLeaderboardsFromSupabase();
    }

    const cloudList = sortLeaderboardEntries(leaderboardsCache[puzzleId] || []);
    const cloudSaved =
      cloudList.find(
        (e) =>
          e.id === saved.id ||
          (saved.playerId && e.playerId === saved.playerId) ||
          (saved.playerEmail && e.playerEmail === saved.playerEmail) ||
          e.playerName === saved.playerName
      ) || saved;

    res.json({
      success: true,
      message: persisted
        ? "Skor berhasil disimpan di leaderboard Supabase!"
        : "Skor tersimpan di server, tetapi gagal ke Supabase: " + (persistError || "unknown"),
      data: cloudSaved,
      list: cloudList,
      persisted,
      persistError: persistError || null,
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
app.post("/api/profile", async (req, res) => {
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

    // Cascade: update avatar/name on published puzzles & leaderboard so others see it
    const newAvatar = updatedProfile.avatar || "🦊";
    const newName = updatedProfile.name || "Pemain TTS";
    let touchedPuzzles = 0;
    for (let i = 0; i < puzzlesCache.length; i++) {
      const p = puzzlesCache[i];
      if (p.authorId && profile.id && p.authorId === profile.id) {
        puzzlesCache[i] = { ...p, authorAvatar: newAvatar, authorName: newName, updatedAt: Date.now() };
        upsertPuzzleToSupabase(puzzlesCache[i]).catch(() => {});
        touchedPuzzles++;
      }
    }
    if (touchedPuzzles > 0) {
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
    }

    let touchedLb = 0;
    for (const pid of Object.keys(leaderboardsCache || {})) {
      const list = leaderboardsCache[pid];
      if (!Array.isArray(list)) continue;
      let changed = false;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.playerId && profile.id && e.playerId === profile.id) {
          list[i] = { ...e, playerAvatar: newAvatar, playerName: newName };
          changed = true;
          touchedLb++;
        }
      }
      if (changed) leaderboardsCache[pid] = list;
    }
    if (touchedLb > 0) {
      try {
        writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
      } catch { /* ignore */ }
    }

    // PENTING: cek hasil upsert profil ke Supabase — sebelumnya
    // `.catch(() => {})` fire-and-forget lalu tetap klaim
    // "berhasil disimpan ke cloud database" walau gagal. Perubahan nama/
    // avatar bisa terlihat sukses di UI padahal sebenarnya tidak
    // tersimpan permanen (hilang saat instance serverless cold-start).
    const profilePersisted = await upsertProfileToSupabase(updatedProfile).catch(() => false);

    res.json({
      success: profilePersisted,
      message: profilePersisted
        ? "Profil berhasil disimpan ke cloud database!"
        : "Profil tersimpan sementara di server, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
      data: updatedProfile,
      cascaded: { puzzles: touchedPuzzles, leaderboard: touchedLb },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menyimpan profil." });
  }
});

// POST full database sync
app.post("/api/sync", async (req, res) => {
  try {
    const { profile, puzzles, leaderboards } = req.body;
    // Track whether every Supabase write actually succeeded — the response
    // must reflect real persistence, not just the in-memory/tmp cache.
    let allPersisted = true;

    // 1. Sync profile — AWAITED so the write finishes before we respond
    // (fire-and-forget here previously risked being cut off on serverless).
    if (profile && profile.id) {
      profilesCache[profile.id] = { ...profile, updatedAt: Date.now() };
      if (profile.syncKey) profilesCache[profile.syncKey] = profilesCache[profile.id];
      writeJsonFile(PROFILES_FILE, profilesCache);
      try {
        const ok = await upsertProfileToSupabase(profilesCache[profile.id]);
        if (!ok) allPersisted = false;
      } catch (e) {
        console.warn("[sync] profile upsert to Supabase failed:", e);
        allPersisted = false;
      }
    }

    // 2. Merge uploaded puzzles — AWAITED, actually persisted to Supabase now
    if (Array.isArray(puzzles)) {
      const toPersist: any[] = [];
      puzzles.forEach((p) => {
        if (p && p.id && !p.isDraft) {
          const idx = puzzlesCache.findIndex((x) => x.id === p.id);
          if (idx >= 0) {
            puzzlesCache[idx] = { ...puzzlesCache[idx], ...p };
            toPersist.push(puzzlesCache[idx]);
          } else {
            puzzlesCache.unshift(p);
            toPersist.push(p);
          }
        }
      });
      writeJsonFile(PUZZLES_FILE, puzzlesCache);

      for (const p of toPersist) {
        try {
          const ok = await upsertPuzzleToSupabase(p);
          if (!ok) allPersisted = false;
        } catch (e) {
          console.warn("[sync] puzzle upsert to Supabase failed:", p.id, e);
          allPersisted = false;
        }
      }
    }

    // 3. Merge leaderboards — AWAITED, actually persisted to Supabase now
    if (leaderboards && typeof leaderboards === 'object') {
      for (const [pId, entries] of Object.entries(leaderboards)) {
        if (!Array.isArray(entries)) continue;
        if (!leaderboardsCache[pId]) leaderboardsCache[pId] = [];
        const newOnes: any[] = [];
        for (const e of entries as any[]) {
          if (e && e.playerName && !leaderboardsCache[pId].some((x) => x.id === e.id)) {
            leaderboardsCache[pId].push(e);
            newOnes.push(e);
          }
        }
        leaderboardsCache[pId].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.timeMs || 0) - (b.timeMs || 0));

        for (const e of newOnes) {
          try {
            const result = await insertLeaderboardEntryToSupabase(pId, e);
            if (!result || !(result as any).ok) allPersisted = false;
          } catch (err) {
            console.warn("[sync] leaderboard entry upsert to Supabase failed:", pId, e.id, err);
            allPersisted = false;
          }
        }
      }
      writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
    }

    if (!allPersisted) {
      // Data is safe in the server's local cache but NOT fully confirmed in
      // Supabase yet — tell the client honestly instead of claiming success.
      return res.status(207).json({
        success: false,
        message: "Sebagian data tersimpan di server, tapi gagal dikonfirmasi ke Supabase. Coba sinkronisasi ulang.",
        cloudPuzzlesCount: puzzlesCache.length,
        timestamp: Date.now(),
      });
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

    // AWAITED — sebelumnya fire-and-forget (.catch(() => {})) lalu tetap
    // klaim sukses tanpa syarat, sama seperti bug yang sudah diperbaiki
    // di register-email/login-email/auto-sync. (Catatan: rute Google
    // login ini saat ini belum dipanggil dari UI manapun, tapi tetap
    // diperbaiki untuk konsistensi kalau diaktifkan nanti.)
    let googlePersisted = true;
    try {
      googlePersisted = Boolean(await upsertUserAccountToSupabase(account));
    } catch {
      googlePersisted = false;
    }

    if (!googlePersisted) {
      return res.status(207).json({
        success: false,
        message: "Login berhasil, tapi gagal menyimpan akun ke Supabase. Coba lagi.",
      });
    }

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

/** Pastikan cache akun terisi dari Supabase (sumber kebenaran lintas browser / instance Vercel). */
async function ensureUserAccountsFromSupabase(force = false): Promise<void> {
  try {
    const sbAccounts = await fetchUserAccountsFromSupabase();
    if (sbAccounts && typeof sbAccounts === "object") {
      // Merge: Supabase menang untuk key yang sama
      userAccountsCache = { ...userAccountsCache, ...sbAccounts };
      writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache);
    }
  } catch (err) {
    console.warn("[auth] Gagal refresh user_accounts dari Supabase:", err);
  }
}

app.post("/api/auth/register-email", async (req, res) => {
  try {
    const { email, password, name, avatar, currentProfile, currentPuzzles, currentDrafts, currentProgress } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email dan kata sandi wajib diisi." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Kata sandi minimal 6 karakter demi keamanan akun Anda." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Selalu cek Supabase dulu (cache /tmp Vercel tidak bisa diandalkan antar browser)
    await ensureUserAccountsFromSupabase();
    const existing = userAccountsCache[cleanEmail];

    if (existing && existing.passwordHash) {
      return res.status(409).json({
        success: false,
        isExistingEmail: true,
        message: "Email ini sudah terdaftar! Silakan gunakan tab 'Masuk (Login)' untuk mengakses akun Anda.",
      });
    }

    const { salt, hash } = hashPassword(password);
    const authToken = generateAuthToken();
    const syncKey = "SYNC-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = (existing && existing.id) || ("usr_" + Math.random().toString(36).substring(2, 10));

    const account = {
      id,
      email: cleanEmail,
      name: name?.trim() || (existing && existing.name) || cleanEmail.split("@")[0] || "Pemain TTS",
      avatar: avatar || (existing && existing.avatar) || "🦊",
      passwordSalt: salt,
      passwordHash: hash,
      authToken,
      provider: "email",
      syncKey: (existing && existing.syncKey) || syncKey,
      isLoggedIn: true,
      autoSyncEnabled: true,
      createdAt: (existing && existing.createdAt) || Date.now(),
      lastSyncedAt: Date.now(),
      totalSolved: (currentProfile && currentProfile.totalSolved) || (existing && existing.totalSolved) || 0,
      totalCreated: (currentProfile && currentProfile.totalCreated) || (existing && existing.totalCreated) || 0,
      puzzles: Array.isArray(currentPuzzles) ? currentPuzzles : (existing && existing.puzzles) || [],
      drafts: Array.isArray(currentDrafts) ? currentDrafts : (existing && existing.drafts) || [],
      progress: currentProgress || (existing && existing.progress) || {},
    };

    userAccountsCache[cleanEmail] = account;
    userAccountsCache[id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache, true);

    // WAJIB await — tanpa ini akun hilang di instance Vercel berikutnya
    const persisted = await upsertUserAccountToSupabase(account);
    if (!persisted) {
      console.error("[auth/register] Gagal menyimpan akun ke Supabase:", cleanEmail);
      return res.status(503).json({
        success: false,
        message: "Gagal menyimpan akun ke database cloud. Coba lagi beberapa saat.",
      });
    }

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
app.post("/api/auth/login-email", async (req, res) => {
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

    // Selalu refresh dari Supabase agar login lintas browser / device berhasil
    await ensureUserAccountsFromSupabase();
    let account = userAccountsCache[cleanEmail];

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
        message: "Kata sandi salah. Silakan coba lagi.",
      });
    }

    // Successful login -> issue new authToken
    const authToken = generateAuthToken();
    account.authToken = authToken;
    account.lastSyncedAt = Date.now();
    account.isLoggedIn = true;

    userAccountsCache[cleanEmail] = account;
    userAccountsCache[account.id] = account;
    writeJsonFile(USER_ACCOUNTS_FILE, userAccountsCache, true);

    // Persist token/session ke Supabase agar instance lain mengenali sesi
    await upsertUserAccountToSupabase(account);

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

    // Token beda antar instance: izinkan sync jika email cocok, perbarui token
    if (account.authToken && token && account.authToken !== token) {
      console.warn("[auto-sync] Token mismatch untuk", cleanEmail, "- memperbarui token instance");
      account.authToken = token;
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

    // AWAITED — previously fire-and-forget (.catch(() => {})). On a
    // serverless function the process can freeze right after res.json(),
    // silently dropping this write before it reached Supabase.
    let persisted = true;
    try {
      persisted = Boolean(await upsertUserAccountToSupabase(account));
    } catch (e) {
      console.warn("[auto-sync] upsert to Supabase failed:", cleanEmail, e);
      persisted = false;
    }

    if (!persisted) {
      return res.status(207).json({
        success: false,
        message: "Data tersimpan sementara di server, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
        lastSyncedAt: account.lastSyncedAt,
      });
    }

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

// 4.1b One-time backfill: isi completionsCount dari entri leaderboard yang
// SUDAH ADA (sebelum fix increment ditambahkan, field ini selalu 0).
// leaderboardsCache[puzzleId] sudah dedup satu entri per pemain unik
// (lihat upsertLocalLeaderboardEntry), jadi jumlah entrinya = jumlah
// penyelesaian unik untuk puzzle tsb. Aman dijalankan berkali-kali
// (idempotent): tidak pernah MENGURANGI completionsCount yang sudah ada,
// hanya menaikkan ke jumlah entri leaderboard kalau itu lebih besar.
app.post("/api/admin/backfill-completions", requireAdminAuth, async (req, res) => {
  try {
    await ensureLeaderboardsFromSupabase();
    await initSupabaseData();

    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const details: { id: string; title: string; before: number; after: number }[] = [];

    for (let i = 0; i < puzzlesCache.length; i++) {
      const puzzle = puzzlesCache[i];
      const entries = leaderboardsCache[puzzle.id];
      const uniqueCompletions = Array.isArray(entries) ? entries.length : 0;
      const before = Number(puzzle.completionsCount) || 0;

      if (uniqueCompletions <= before) {
        skippedCount++;
        continue;
      }

      puzzlesCache[i].completionsCount = uniqueCompletions;
      puzzlesCache[i].updatedAt = Date.now();
      puzzlesCache[i] = withPlayMetaEmbedded(puzzlesCache[i]);

      const ok = await upsertPuzzleToSupabase(puzzlesCache[i]);
      if (ok) {
        updatedCount++;
        details.push({
          id: puzzle.id,
          title: puzzle.title,
          before,
          after: uniqueCompletions,
        });
      } else {
        failedCount++;
        console.warn("[backfill-completions] Gagal upsert ke Supabase:", puzzle.id);
      }
    }

    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);

    res.json({
      success: failedCount === 0,
      message:
        failedCount === 0
          ? `Backfill selesai. ${updatedCount} TTS diperbarui, ${skippedCount} sudah sesuai/dilewati.`
          : `Backfill selesai dengan ${failedCount} kegagalan upsert ke Supabase. ${updatedCount} TTS berhasil diperbarui.`,
      updatedCount,
      skippedCount,
      failedCount,
      details: details.slice(0, 50), // batasi payload respons
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Gagal menjalankan backfill: " + (err?.message || "Error"),
    });
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
        ? "Konfigurasi Supabase berhasil disimpan dan terhubung untuk instance ini. PENTING: penyimpanan ini sementara (di /tmp) dan tidak dibagi ke instance serverless lain di Vercel — untuk hasil permanen & konsisten di semua instance, set SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY di Vercel → Settings → Environment Variables, lalu redeploy."
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
app.put("/api/admin/users/:id", requireAdminAuth, async (req, res) => {
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

    // PENTING: cek hasil upsert ke Supabase — sebelumnya fire-and-forget
    // lalu tetap klaim sukses. Kalau gagal, perubahan (ban/nama/stats)
    // hanya ada di cache instance ini dan bisa "hilang" begitu instance
    // lain/cold-start menangani request berikutnya.
    const userPersisted = await upsertUserAccountToSupabase(targetAcc).catch(() => false);

    res.json({
      success: userPersisted,
      message: userPersisted
        ? "Data pengguna berhasil diperbarui."
        : "Perubahan tersimpan sementara, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
      data: targetAcc,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memperbarui data pengguna." });
  }
});

// 7. Admin - Reset User Password
app.post("/api/admin/users/:id/reset-password", requireAdminAuth, async (req, res) => {
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

    // PENTING: kalau upsert ke Supabase gagal di sini dan tetap dilaporkan
    // "berhasil", admin akan mengira password sudah direset padahal
    // Supabase masih menyimpan hash password LAMA — user tidak akan bisa
    // login dengan password baru dari instance/browser lain. Ini bug yang
    // cukup membingungkan kalau tidak jujur dilaporkan.
    const pwPersisted = await upsertUserAccountToSupabase(targetAcc).catch(() => false);

    res.json({
      success: pwPersisted,
      message: pwPersisted
        ? `Kata sandi untuk akun ${targetAcc.email || targetAcc.name} berhasil direset!`
        : `Gagal menyimpan password baru ke Supabase untuk ${targetAcc.email || targetAcc.name}. Coba lagi.`,
    });
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
app.post("/api/admin/puzzles/:id/toggle-feature", requireAdminAuth, async (req, res) => {
  const pId = req.params.id;
  const idx = puzzlesCache.findIndex((p) => p.id === pId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Teka-teki tidak ditemukan." });
  }

  puzzlesCache[idx].isFeatured = !puzzlesCache[idx].isFeatured;
  puzzlesCache[idx].updatedAt = Date.now();

  writeJsonFile(PUZZLES_FILE, puzzlesCache);
  // PENTING: cek hasil upsert — sebelumnya fire-and-forget lalu tetap
  // klaim sukses, jadi status "Pilihan Editor" bisa tidak konsisten
  // antar instance kalau upsert ke Supabase sebenarnya gagal.
  const featurePersisted = await upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => false);

  res.json({
    success: featurePersisted,
    message: featurePersisted
      ? (puzzlesCache[idx].isFeatured ? "Teka-teki ditandai sebagai Pilihan Editor ⭐" : "Tanda Pilihan Editor dihapus.")
      : "Tersimpan sementara, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
    isFeatured: puzzlesCache[idx].isFeatured,
  });
});

// 11. Admin - Edit Puzzle Metadata
app.put("/api/admin/puzzles/:id", requireAdminAuth, async (req, res) => {
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
  // PENTING: cek hasil upsert — sebelumnya fire-and-forget lalu tetap
  // klaim "berhasil diperbarui" walau perubahan admin gagal tersimpan
  // permanen ke Supabase.
  const editPersisted = await upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => false);

  res.json({
    success: editPersisted,
    message: editPersisted
      ? "Teka-teki berhasil diperbarui oleh Administrator."
      : "Tersimpan sementara, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
    data: puzzlesCache[idx],
  });
});

// 12. Admin - Permanently Delete Puzzle
app.delete("/api/admin/puzzles/:id", requireAdminAuth, async (req, res) => {
  const pId = req.params.id;
  const idx = puzzlesCache.findIndex((p) => p.id === pId);
  const deletedTitle =
    idx >= 0 ? puzzlesCache[idx].title : pId;

  if (idx >= 0) {
    puzzlesCache.splice(idx, 1);
  }
  delete leaderboardsCache[pId];

  writeJsonFile(PUZZLES_FILE, puzzlesCache);
  writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
  writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);

  // PENTING: cek hasil delete di Supabase — sebelumnya fire-and-forget
  // lalu tetap klaim "berhasil dihapus secara permanen" walau puzzle
  // sebenarnya masih ada di Supabase dan akan muncul lagi di instance lain.
  const adminDeletePersisted = await deletePuzzleFromSupabase(pId).catch(() => false);

  res.json({
    success: adminDeletePersisted,
    message: adminDeletePersisted
      ? `Teka-teki "${deletedTitle}" berhasil dihapus secara permanen.`
      : `Dihapus dari cache server, tapi GAGAL dihapus dari Supabase — "${deletedTitle}" bisa muncul lagi. Coba lagi.`,
  });
});

// 12.1 Admin - Generate TTS Otomatis (AI: Groq + penyusun grid lokal)
app.post("/api/admin/generate-puzzle", requireAdminAuth, async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "GROQ_API_KEY belum diset di Vercel Environment Variables.",
      });
    }

    const topic = String(req.body?.topic || "").trim().slice(0, 100);
    if (!topic) {
      return res.status(400).json({ success: false, message: "Topik tidak boleh kosong." });
    }
    const wordCount = Math.max(6, Math.min(20, Number(req.body?.wordCount) || 12));
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    let entries: WordClueInput[];
    try {
      entries = await generateWordsWithGroq(topic, wordCount, apiKey, model);
    } catch (e: any) {
      console.error("[admin] generate-puzzle Groq error:", e);
      return res.status(502).json({
        success: false,
        message: "Gagal menghasilkan kata dari AI: " + (e?.message || "Error tidak diketahui"),
      });
    }

    if (entries.length < 3) {
      return res.status(422).json({
        success: false,
        message: `AI hanya menghasilkan ${entries.length} kata valid — terlalu sedikit. Coba topik lain atau ulangi.`,
      });
    }

    const packed = packCrossword(entries);
    if (!packed) {
      return res.status(422).json({
        success: false,
        message: "Gagal menyusun grid TTS dari kata yang dihasilkan AI. Coba topik lain atau ulangi.",
      });
    }

    const clues = numberAndBuildClues(packed.grid, packed.placements);
    const puzzleId = "ai_" + Math.random().toString(36).substring(2, 11);
    const now = Date.now();
    const puzzle: any = {
      id: puzzleId,
      title: `TTS: ${topic}`,
      description: `Dibuat otomatis oleh AI dengan topik "${topic}"`,
      authorName: "AI Generator ✨",
      authorId: AI_GENERATED_AUTHOR_ID,
      authorAvatar: "🪄",
      width: packed.grid[0]?.length || 0,
      height: packed.grid.length,
      grid: packed.grid,
      clues,
      isDraft: true,
      isFeatured: false,
      reactions: { like: 0, laugh: 0, love: 0, think: 0, fire: 0, sad: 0 },
      userReactions: {},
      comments: [],
      createdAt: now,
      updatedAt: now,
    };

    puzzlesCache.unshift(puzzle);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    writeJsonFile(PUZZLES_BACKUP_FILE, puzzlesCache);
    const persisted = await upsertPuzzleToSupabase(puzzle).catch(() => false);

    res.json({
      success: true,
      data: puzzle,
      persisted,
      wordsRequested: wordCount,
      wordsPlaced: packed.placements.length,
      message: persisted
        ? `TTS "${topic}" berhasil digenerate (${packed.placements.length} dari ${entries.length} kata berhasil disusun) dan tersimpan sebagai draft.`
        : `TTS berhasil digenerate, tapi gagal dikonfirmasi ke Supabase. Coba simpan ulang dari daftar draft.`,
    });
  } catch (err: any) {
    console.error("[admin] generate-puzzle error:", err);
    res.status(500).json({ success: false, message: "Gagal generate TTS otomatis." });
  }
});

// 12.2 Admin - List draft hasil generate AI (belum dipublikasikan)
app.get("/api/admin/ai-drafts", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
    const drafts = puzzlesCache.filter(
      (p) => p.isDraft && p.authorId === AI_GENERATED_AUTHOR_ID
    );
    res.json({ success: true, data: drafts });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal memuat draft AI." });
  }
});

// 12.3 Admin - Edit draft hasil generate AI (judul, deskripsi, teks soal)
app.put("/api/admin/ai-drafts/:id", requireAdminAuth, async (req, res) => {
  try {
    const pId = req.params.id;
    const idx = puzzlesCache.findIndex((p) => p.id === pId && p.authorId === AI_GENERATED_AUTHOR_ID);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Draft AI tidak ditemukan." });
    }

    const { title, description, clues } = req.body;
    if (title) puzzlesCache[idx].title = String(title).trim().slice(0, 120);
    if (description !== undefined) puzzlesCache[idx].description = String(description).trim().slice(0, 300);
    if (Array.isArray(clues)) {
      // Hanya izinkan update teks soal (question) per clue id yang sudah ada
      // — struktur grid/jawaban tidak diubah dari sini agar tetap konsisten.
      const clueMap = new Map(puzzlesCache[idx].clues.map((c: any) => [c.id, c]));
      for (const c of clues) {
        if (c && c.id && clueMap.has(c.id) && typeof c.question === "string") {
          (clueMap.get(c.id) as any).question = c.question.slice(0, 200);
        }
      }
    }
    puzzlesCache[idx].updatedAt = Date.now();

    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    const persisted = await upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => false);

    res.json({
      success: persisted,
      data: puzzlesCache[idx],
      message: persisted
        ? "Draft berhasil disimpan."
        : "Tersimpan sementara, tapi gagal dikonfirmasi ke Supabase. Coba lagi.",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal menyimpan draft AI." });
  }
});

// 12.4 Admin - Publikasikan draft hasil generate AI ke komunitas
app.post("/api/admin/ai-drafts/:id/publish", requireAdminAuth, async (req, res) => {
  try {
    const pId = req.params.id;
    const idx = puzzlesCache.findIndex((p) => p.id === pId && p.authorId === AI_GENERATED_AUTHOR_ID);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: "Draft AI tidak ditemukan." });
    }

    const authorName = String(req.body?.authorName || "").trim().slice(0, 60);
    if (authorName) puzzlesCache[idx].authorName = authorName;
    puzzlesCache[idx].isDraft = false;
    puzzlesCache[idx].updatedAt = Date.now();

    writeJsonFile(PUZZLES_FILE, puzzlesCache);
    const persisted = await upsertPuzzleToSupabase(puzzlesCache[idx]).catch(() => false);

    if (!persisted) {
      // Rollback status draft lokal supaya tidak "kelihatan publish" padahal
      // Supabase (sumber data komunitas) belum benar-benar menyimpannya.
      puzzlesCache[idx].isDraft = true;
      writeJsonFile(PUZZLES_FILE, puzzlesCache);
      return res.status(502).json({
        success: false,
        message: "Gagal mempublikasikan ke Supabase. Coba lagi.",
      });
    }

    res.json({
      success: true,
      data: puzzlesCache[idx],
      message: `TTS "${puzzlesCache[idx].title}" berhasil dipublikasikan ke komunitas!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Gagal mempublikasikan draft AI." });
  }
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
app.delete("/api/admin/comments/:puzzleId/:commentId", requireAdminAuth, async (req, res) => {
  const { puzzleId, commentId } = req.params;
  const pIdx = puzzlesCache.findIndex((p) => p.id === puzzleId);
  if (pIdx < 0) {
    return res.json({ success: true, message: "Komentar tidak ditemukan (mungkin sudah terhapus)." });
  }
  if (Array.isArray(puzzlesCache[pIdx].comments)) {
    puzzlesCache[pIdx].comments = puzzlesCache[pIdx].comments.filter((c: any) => c.id !== commentId);
    writeJsonFile(PUZZLES_FILE, puzzlesCache);
  }
  // PENTING: cek hasil upsert ke Supabase — sebelumnya `.catch(() => {})`
  // menelan error lalu tetap klaim sukses. Kalau upsert gagal, komentar
  // yang sedang dimoderasi admin masih ada di kolom `comments` versi
  // Supabase dan akan MUNCUL LAGI begitu puzzle di-fetch ulang dari sana.
  const persisted = await upsertPuzzleToSupabase(puzzlesCache[pIdx]).catch(() => false);
  res.json({
    success: persisted,
    message: persisted
      ? "Komentar berhasil dimoderasi dan dihapus."
      : "Dihapus dari cache server, tapi GAGAL tersimpan ke Supabase — komentar ini bisa muncul lagi setelah refresh. Coba lagi.",
  });
});

// 15. Admin - List All Leaderboard Entries
app.get("/api/admin/leaderboards", requireAdminAuth, async (req, res) => {
  try {
    await initSupabaseData();
    await ensureLeaderboardsFromSupabase();
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
app.delete("/api/admin/leaderboards/:puzzleId/:id", requireAdminAuth, async (req, res) => {
  const { puzzleId, id } = req.params;
  if (leaderboardsCache[puzzleId]) {
    leaderboardsCache[puzzleId] = leaderboardsCache[puzzleId].filter((e: any) => e.id !== id);
    writeJsonFile(LEADERBOARDS_FILE, leaderboardsCache);
  }
  // PENTING: hasil delete ke Supabase HARUS dicek. Sebelumnya
  // `.catch(() => {})` menelan error lalu tetap klaim "berhasil dihapus
  // dari Supabase" — kalau gagal, entri yang sedang dimoderasi admin
  // (misal skor curang) akan MUNCUL LAGI begitu leaderboardsCache
  // di-refresh ulang dari Supabase, tanpa admin sadar moderasinya gagal.
  const deletedFromSupabase = await deleteLeaderboardEntryFromSupabase(puzzleId, id).catch(() => false);
  res.json({
    success: deletedFromSupabase,
    message: deletedFromSupabase
      ? "Rekor skor leaderboard berhasil dihapus dari Supabase."
      : "Dihapus dari cache server, tapi GAGAL dihapus dari Supabase — entri ini bisa muncul lagi setelah refresh. Coba lagi.",
  });
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
