import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Default config (fallback)
const defaultSbConfig = {
  url: "",
  key: "",
};

// Atau kalau mau tetap baca dari file (lebih aman):
/*
function loadDefaultConfig() {
  try {
    const configPath = path.join(__dirname, "supabase_config.json");
    // di ESM __dirname tidak ada, jadi pakai:
    // const configPath = path.join(process.cwd(), "lib", "supabase_config.json");
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return { url: "", key: "" };
  }
}
const defaultSbConfig = loadDefaultConfig();
*/

const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel
  ? path.join("/tmp", "tts_data")
  : path.join(process.cwd(), "data");

const SUPABASE_CONFIG_FILE = path.join(DATA_DIR, "supabase_runtime_config.json");

let inMemoryUrl = "";
let inMemoryKey = "";
let supabaseClient: SupabaseClient | null = null;
let lastKnownUrl = "";
let lastKnownKey = "";

// Helper to sanitize environment strings
function cleanString(val: any): string {
  if (!val || typeof val !== "string") return "";
  return val.trim().replace(/^['"]|['"]$/g, "").trim();
}

// Load dynamic runtime config if saved
export function getRuntimeSupabaseConfig(): { url: string; key: string } {
  let runtimeUrl = inMemoryUrl;
  let runtimeKey = inMemoryKey;

  if (!runtimeUrl || !runtimeKey) {
    const candidatePaths = [
      "/tmp/tts_data/supabase_runtime_config.json",
      "/tmp/supabase_runtime_config.json",
      path.join(DATA_DIR, "supabase_runtime_config.json"),
    ];

    for (const filePath of candidatePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (data.url && data.key) {
            runtimeUrl = cleanString(data.url);
            runtimeKey = cleanString(data.key);
            inMemoryUrl = runtimeUrl;
            inMemoryKey = runtimeKey;
            break;
          }
        }
      } catch {
        // safe fallback
      }
    }
  }

  const envUrl = cleanString(
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  );

  const envKey = cleanString(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  );

  const finalUrl = runtimeUrl || envUrl || cleanString(defaultSbConfig?.url);
  const finalKey = runtimeKey || envKey || cleanString(defaultSbConfig?.key);

  return {
    url: finalUrl,
    key: finalKey,
  };
}

// Save dynamic runtime config - Always succeeds in memory & attempts disk persistence
export function saveRuntimeSupabaseConfig(url: string, key: string): boolean {
  const cleanUrl = cleanString(url);
  const cleanKey = cleanString(key);

  if (!cleanUrl || !cleanKey) return false;

  // 1. Save in-memory
  inMemoryUrl = cleanUrl;
  inMemoryKey = cleanKey;

  // 2. Save to process.env
  process.env.SUPABASE_URL = cleanUrl;
  process.env.SUPABASE_KEY = cleanKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = cleanKey;

  // 3. Reset client instance
  supabaseClient = null;
  lastKnownUrl = "";
  lastKnownKey = "";

  // 4. Try saving to multiple writable locations (/tmp and DATA_DIR)
  const candidateDirs = ["/tmp/tts_data", "/tmp", DATA_DIR];
  for (const dir of candidateDirs) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(dir, "supabase_runtime_config.json"),
        JSON.stringify({ url: cleanUrl, key: cleanKey, updatedAt: Date.now() }, null, 2),
        "utf-8"
      );
    } catch {
      // safe fallback if some paths are read-only
    }
  }

  return true;
}

export function getSupabase(): SupabaseClient | null {
  const { url, key } = getRuntimeSupabaseConfig();

  if (!url || !key) {
    return null;
  }

  // Validate URL format
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return null;
  }

  if (!supabaseClient || lastKnownUrl !== url || lastKnownKey !== key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      lastKnownUrl = url;
      lastKnownKey = key;
    } catch (err) {
      console.error("[Supabase] Initialization error:", err);
      return null;
    }
  }

  return supabaseClient;
}

export async function checkSupabaseStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  tablesReady: boolean;
  url?: string;
  maskedKey?: string;
  source?: string;
  tables?: {
    puzzles: boolean;
    user_accounts: boolean;
    leaderboard: boolean;
    profiles: boolean;
  };
  tableDetails?: {
    puzzlesError?: string;
    usersError?: string;
    leaderboardError?: string;
    profilesError?: string;
  };
  error?: string;
}> {
  const { url, key } = getRuntimeSupabaseConfig();
  const client = getSupabase();

  if (!url || !key || !client) {
    return {
      configured: false,
      connected: false,
      tablesReady: false,
      error: "SUPABASE_URL atau SUPABASE_KEY belum diisi. Anda dapat mengisinya langsung pada Panel Admin atau di menu Environment Variables Vercel.",
    };
  }

  const maskedKey =
    key.length > 12
      ? key.substring(0, 6) + "..." + key.substring(key.length - 4)
      : "***";

  const tablesStatus = {
    puzzles: false,
    user_accounts: false,
    leaderboard: false,
    profiles: false,
  };

  const tableDetails: any = {};

  try {
    // 1. Test basic connectivity (Ping Auth/REST)
    let restConnected = false;
    try {
      const pingUrl = `${url.replace(/\/+$/, "")}/rest/v1/`;
      const pingRes = await fetch(pingUrl, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });
      // Supabase REST endpoint returns 200 (schema docs) or 401 if invalid key
      if (pingRes.status === 200 || pingRes.status === 404 || pingRes.status === 400) {
        restConnected = true;
      } else if (pingRes.status === 401 || pingRes.status === 403) {
        return {
          configured: true,
          connected: false,
          tablesReady: false,
          url,
          maskedKey,
          error: "Kunci API Supabase (API Key/Service Role) tidak valid atau ditolak oleh server Supabase (HTTP 401/403).",
        };
      }
    } catch (netErr: any) {
      console.warn("[Supabase] Direct ping note:", netErr?.message);
    }

    // 2. Test tables
    const { error: pErr } = await client.from("puzzles").select("id").limit(1);
    tablesStatus.puzzles = !pErr;
    if (pErr) tableDetails.puzzlesError = pErr.message;

    const { error: uErr } = await client.from("user_accounts").select("id").limit(1);
    tablesStatus.user_accounts = !uErr;
    if (uErr) tableDetails.usersError = uErr.message;

    const { error: lErr } = await client.from("leaderboard").select("id").limit(1);
    tablesStatus.leaderboard = !lErr;
    if (lErr) tableDetails.leaderboardError = lErr.message;

    const { error: prErr } = await client.from("profiles").select("id").limit(1);
    tablesStatus.profiles = !prErr;
    if (prErr) tableDetails.profilesError = prErr.message;

    const anyTableExists =
      tablesStatus.puzzles ||
      tablesStatus.user_accounts ||
      tablesStatus.leaderboard ||
      tablesStatus.profiles;

    const allTablesReady =
      tablesStatus.puzzles &&
      tablesStatus.user_accounts &&
      tablesStatus.leaderboard &&
      tablesStatus.profiles;

    // We consider it connected if rest connected or any table exists
    const isConn = restConnected || anyTableExists;

    return {
      configured: true,
      connected: isConn,
      tablesReady: allTablesReady,
      url,
      maskedKey,
      tables: tablesStatus,
      tableDetails,
      error: !isConn
        ? "Gagal terhubung ke host Supabase Cloud. Periksa URL atau koneksi jaringan."
        : !anyTableExists
        ? "Terkoneksi ke Supabase Cloud, namun tabel database (puzzles, user_accounts, leaderboard, profiles) belum dibuat di SQL Editor Supabase."
        : undefined,
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      tablesReady: false,
      url,
      maskedKey,
      error: err?.message || "Gagal menghubungkan ke Supabase.",
      tables: tablesStatus,
      tableDetails,
    };
  }
}

// --- Database Operations ---

export async function fetchPuzzlesFromSupabase(): Promise<any[] | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("puzzles")
      .select("*");

    if (error) {
      console.warn("[Supabase] Error fetching puzzles:", error.message);
      return null;
    }

    const puzzles = (data || []).map((row) => {
      // If data column is used or properties are flattened
      if (row.data && typeof row.data === "object") {
        return {
          ...row.data,
          id: row.id || row.data.id,
          title: row.title || row.data.title,
          authorName: row.author_name || row.authorName || row.data.authorName,
          authorId: row.author_id || row.authorId || row.data.authorId,
          createdAt: Number(row.created_at || row.createdAt || row.data.createdAt) || Date.now(),
          updatedAt: Number(row.updated_at || row.updatedAt || row.data.updatedAt) || Date.now(),
          reactions: row.reactions || row.data.reactions,
          userReactions: row.user_reactions || row.userReactions || row.data.userReactions,
          comments: row.comments || row.data.comments || [],
        };
      }
      return {
        id: row.id,
        title: row.title,
        authorName: row.author_name || row.authorName || "Pemain TTS",
        authorId: row.author_id || row.authorId,
        authorAvatar: row.author_avatar || row.authorAvatar || "??",
        authorEmail: row.author_email || row.authorEmail,
        customCode: row.custom_code || row.customCode || row.share_code,
        width: Number(row.width) || 10,
        height: Number(row.height) || 10,
        grid: row.grid,
        clues: row.clues,
        createdAt: Number(row.created_at || row.createdAt) || Date.now(),
        updatedAt: Number(row.updated_at || row.updatedAt) || Date.now(),
        reactions: row.reactions || { like: 0, laugh: 0, love: 0, think: 0, fire: 0, sad: 0 },
        userReactions: row.user_reactions || row.userReactions || {},
        comments: row.comments || [],
        isDraft: Boolean(row.is_draft ?? row.isDraft),
        isFeatured: Boolean(row.is_featured ?? row.isFeatured),
      };
    });

    return puzzles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.error("[Supabase] fetchPuzzles exception:", err);
    return null;
  }
}

export async function upsertPuzzleToSupabase(puzzle: any): Promise<boolean> {
  const client = getSupabase();
  if (!client || !puzzle || !puzzle.id) return false;

  try {
    const payload: Record<string, any> = {
      id: String(puzzle.id),
      title: puzzle.title || "Teka Teki Silang",
      author_name: puzzle.authorName || "Pemain TTS",
      author_id: puzzle.authorId || null,
      author_avatar: puzzle.authorAvatar || "??",
      author_email: puzzle.authorEmail || null,
      custom_code: puzzle.customCode || null,
      width: Number(puzzle.width) || 10,
      height: Number(puzzle.height) || 10,
      grid: puzzle.grid || [],
      clues: puzzle.clues || { across: [], down: [] },
      reactions: puzzle.reactions || { like: 0, laugh: 0, love: 0, think: 0, fire: 0, sad: 0 },
      user_reactions: puzzle.userReactions || {},
      comments: puzzle.comments || [],
      is_draft: Boolean(puzzle.isDraft),
      is_featured: Boolean(puzzle.isFeatured),
      created_at: Number(puzzle.createdAt) || Date.now(),
      updated_at: Number(puzzle.updatedAt) || Date.now(),
      data: puzzle, // full json backup column
    };

    const { error } = await client.from("puzzles").upsert(payload, { onConflict: "id" });
    if (error) {
      // Fallback with minimal json data column
      const { error: fallbackErr } = await client.from("puzzles").upsert({
        id: String(puzzle.id),
        title: puzzle.title || "Teka Teki Silang",
        data: puzzle,
      }, { onConflict: "id" });
      if (fallbackErr) {
        console.warn("[Supabase] Upsert puzzle fallback warning:", fallbackErr.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Upsert puzzle exception:", err);
    return false;
  }
}

export async function deletePuzzleFromSupabase(id: string): Promise<boolean> {
  const client = getSupabase();
  if (!client || !id) return false;

  try {
    await client.from("puzzles").delete().eq("id", id);
    try {
      await client.from("leaderboard").delete().eq("puzzle_id", id);
    } catch {
      // ignore if column differs
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Delete puzzle exception:", err);
    return false;
  }
}

export async function fetchLeaderboardsFromSupabase(): Promise<Record<string, any[]> | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    // Fetch all leaderboard entries without forcing specific column ordering that might not exist
    const { data, error } = await client
      .from("leaderboard")
      .select("*");

    if (error) {
      console.warn("[Supabase] Leaderboard fetch note:", error.message);
      return null;
    }

    const map: Record<string, any[]> = {};
    (data || []).forEach((row) => {
      const pId = row.puzzle_id || row.puzzleId || row.data?.puzzleId;
      if (!pId) return;

      if (!map[pId]) map[pId] = [];
      const entry = {
        id: row.id || row.data?.id || "lead_" + Math.random().toString(36).substring(2, 9),
        puzzleId: pId,
        playerName: row.player_name || row.playerName || row.player || row.name || row.data?.playerName || "Pemain TTS",
        playerAvatar: row.player_avatar || row.playerAvatar || row.avatar || row.data?.playerAvatar || "??",
        playerId: row.player_id || row.playerId || row.data?.playerId || null,
        playerEmail: row.player_email || row.playerEmail || row.email || row.data?.playerEmail || null,
        timeMs: Number(row.time_ms ?? row.timeMs ?? row.time ?? row.duration ?? row.data?.timeMs) || 0,
        score: Number(row.score ?? row.data?.score) || 1000,
        formattedTime: row.formatted_time || row.formattedTime || row.data?.formattedTime || null,
        completedAt: Number(row.completed_at ?? row.completedAt ?? row.created_at ?? row.data?.completedAt) || Date.now(),
        ...(row.data || {}),
      };

      map[pId].push(entry);
    });

    // Sort entries per puzzle by fastest time
    Object.keys(map).forEach((pId) => {
      map[pId].sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
    });

    return map;
  } catch (err) {
    console.error("[Supabase] fetchLeaderboards exception:", err);
    return null;
  }
}

export async function insertLeaderboardEntryToSupabase(puzzleId: string, entry: any): Promise<boolean> {
  const client = getSupabase();
  if (!client || !puzzleId || !entry) return false;

  try {
    const entryId = String(entry.id || "lead_" + Math.random().toString(36).substring(2, 9));
    const payload: Record<string, any> = {
      id: entryId,
      puzzle_id: String(puzzleId),
      player_name: entry.playerName || "Pemain TTS",
      player_avatar: entry.playerAvatar || "??",
      player_id: entry.playerId || null,
      player_email: entry.playerEmail || null,
      time_ms: Number(entry.timeMs) || 0,
      score: Number(entry.score) || 1000,
      formatted_time: entry.formattedTime || null,
      completed_at: Number(entry.completedAt) || Date.now(),
      data: entry,
    };

    const { error } = await client.from("leaderboard").upsert(payload, { onConflict: "id" });
    if (error) {
      // If column mismatch error, fallback to minimal payload with JSON data
      const { error: fallbackErr } = await client.from("leaderboard").upsert({
        id: entryId,
        puzzle_id: String(puzzleId),
        data: entry,
      }, { onConflict: "id" });

      if (fallbackErr) {
        console.warn("[Supabase] Insert leaderboard fallback note:", fallbackErr.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Insert leaderboard exception:", err);
    return false;
  }
}

export async function fetchUserAccountsFromSupabase(): Promise<Record<string, any> | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client.from("user_accounts").select("*");
    if (error) {
      console.warn("[Supabase] User accounts fetch error:", error.message);
      return null;
    }

    const map: Record<string, any> = {};
    (data || []).forEach((row) => {
      const acc = {
        id: row.id,
        email: row.email,
        name: row.name,
        avatar: row.avatar || "??",
        photoUrl: row.photo_url,
        googleId: row.google_id,
        passwordSalt: row.password_salt,
        passwordHash: row.password_hash,
        authToken: row.auth_token,
        syncKey: row.sync_key,
        provider: row.provider || "email",
        totalSolved: Number(row.total_solved) || 0,
        totalCreated: Number(row.total_created) || 0,
        puzzles: row.puzzles || [],
        drafts: row.drafts || [],
        progress: row.progress || {},
        createdAt: Number(row.created_at) || Date.now(),
        lastSyncedAt: Number(row.last_synced_at) || Date.now(),
        isLoggedIn: true,
        autoSyncEnabled: true,
      };

      if (acc.email) map[acc.email.toLowerCase()] = acc;
      if (acc.id) map[acc.id] = acc;
      if (acc.googleId) map[`google_${acc.googleId}`] = acc;
    });

    return map;
  } catch (err) {
    console.error("[Supabase] fetchUserAccounts exception:", err);
    return null;
  }
}

export async function upsertUserAccountToSupabase(account: any): Promise<boolean> {
  const client = getSupabase();
  if (!client || !account || (!account.email && !account.id)) return false;

  try {
    const payload = {
      id: String(account.id || "usr_" + Math.random().toString(36).substring(2, 9)),
      email: account.email ? account.email.trim().toLowerCase() : null,
      name: account.name || "Pemain TTS",
      avatar: account.avatar || "??",
      photo_url: account.photoUrl || null,
      google_id: account.googleId || null,
      password_salt: account.passwordSalt || null,
      password_hash: account.passwordHash || null,
      auth_token: account.authToken || null,
      sync_key: account.syncKey || null,
      provider: account.provider || "email",
      total_solved: Number(account.totalSolved) || 0,
      total_created: Number(account.totalCreated) || 0,
      puzzles: account.puzzles || [],
      drafts: account.drafts || [],
      progress: account.progress || {},
      created_at: Number(account.createdAt) || Date.now(),
      last_synced_at: Number(account.lastSyncedAt) || Date.now(),
    };

    const { error } = await client.from("user_accounts").upsert(payload, { onConflict: "id" });
    if (error) {
      console.warn("[Supabase] Upsert user account error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] Upsert user account exception:", err);
    return false;
  }
}

export async function fetchProfilesFromSupabase(): Promise<Record<string, any> | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client.from("profiles").select("*");
    if (error) {
      return null;
    }

    const map: Record<string, any> = {};
    (data || []).forEach((row) => {
      const p = {
        id: row.id,
        name: row.name,
        avatar: row.avatar || "??",
        syncKey: row.sync_key,
        totalSolved: Number(row.total_solved) || 0,
        totalCreated: Number(row.total_created) || 0,
        updatedAt: Number(row.updated_at) || Date.now(),
        ...(row.data || {}),
      };
      if (p.id) map[p.id] = p;
      if (p.syncKey) map[p.syncKey] = p;
    });

    return map;
  } catch (err) {
    return null;
  }
}

export async function upsertProfileToSupabase(profile: any): Promise<boolean> {
  const client = getSupabase();
  if (!client || !profile || !profile.id) return false;

  try {
    const payload = {
      id: String(profile.id),
      name: profile.name || "Pemain TTS",
      avatar: profile.avatar || "??",
      sync_key: profile.syncKey || null,
      total_solved: Number(profile.totalSolved) || 0,
      total_created: Number(profile.totalCreated) || 0,
      updated_at: Number(profile.updatedAt) || Date.now(),
      data: profile,
    };

    await client.from("profiles").upsert(payload, { onConflict: "id" });
    return true;
  } catch (err) {
    return false;
  }
}
