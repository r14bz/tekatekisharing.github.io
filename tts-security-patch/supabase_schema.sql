-- =========================================================
-- TEKA TEKI SHARING - SUPABASE SQL SCHEMA
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =========================================================

-- 1. TABEL PUZZLES (TEKA TEKI SILANG)
CREATE TABLE IF NOT EXISTS public.puzzles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Teka Teki Silang',
    author_name TEXT DEFAULT 'Pemain TTS',
    author_id TEXT,
    author_avatar TEXT DEFAULT '🦊',
    author_email TEXT,
    custom_code TEXT,
    width INTEGER DEFAULT 10,
    height INTEGER DEFAULT 10,
    grid JSONB DEFAULT '[]'::jsonb,
    clues JSONB DEFAULT '{"across":[],"down":[]}'::jsonb,
    reactions JSONB DEFAULT '{"like":0,"laugh":0,"love":0,"think":0,"fire":0,"sad":0}'::jsonb,
    user_reactions JSONB DEFAULT '{}'::jsonb,
    comments JSONB DEFAULT '[]'::jsonb,
    is_draft BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- Pastikan kolom baru tetap ada jika tabel sudah pernah dibuat sebelumnya
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;
ALTER TABLE public.puzzles ADD COLUMN IF NOT EXISTS data JSONB;

-- 2. TABEL USER_ACCOUNTS (AKUN PENGGUNA)
CREATE TABLE IF NOT EXISTS public.user_accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    photo_url TEXT,
    google_id TEXT,
    password_salt TEXT,
    password_hash TEXT,
    auth_token TEXT,
    sync_key TEXT,
    provider TEXT DEFAULT 'email',
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    puzzles JSONB DEFAULT '[]'::jsonb,
    drafts JSONB DEFAULT '[]'::jsonb,
    progress JSONB DEFAULT '{}'::jsonb,
    created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    last_synced_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- 3. TABEL LEADERBOARD (PAPAN SKOR / SPEEDRUN)
CREATE TABLE IF NOT EXISTS public.leaderboard (
    id TEXT PRIMARY KEY,
    puzzle_id TEXT NOT NULL,
    player_name TEXT DEFAULT 'Pemain TTS',
    player_avatar TEXT DEFAULT '🦊',
    player_id TEXT,
    player_email TEXT,
    time_ms BIGINT DEFAULT 0,
    score INTEGER DEFAULT 1000,
    formatted_time TEXT,
    completed_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- Pastikan kolom time_ms dan puzzle_id ada jika tabel sudah pernah dibuat
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS time_ms BIGINT DEFAULT 0;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS formatted_time TEXT;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 1000;
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS player_avatar TEXT DEFAULT '🦊';
ALTER TABLE public.leaderboard ADD COLUMN IF NOT EXISTS data JSONB;

-- 4. TABEL PROFILES (PROFIL CADANGAN)
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT 'Pemain TTS',
    avatar TEXT DEFAULT '🦊',
    sync_key TEXT,
    total_solved INTEGER DEFAULT 0,
    total_created INTEGER DEFAULT 0,
    updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    data JSONB
);

-- 5. INDEXES UNTUK KECEPATAN QUERY
CREATE INDEX IF NOT EXISTS idx_puzzles_created_at ON public.puzzles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_puzzles_author_id ON public.puzzles(author_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_puzzle_id ON public.leaderboard(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_time_ms ON public.leaderboard(time_ms ASC);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON public.user_accounts(email);

-- 6. AKTIFKAN RLS (ROW LEVEL SECURITY)
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 7. POLICY AMAN
-- Backend memakai SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
-- Kunci anon / publishable hanya boleh READ data publik.
-- Jangan beri WRITE penuh ke anon key.

-- Hapus policy lama yang terlalu terbuka
DROP POLICY IF EXISTS "Public read puzzles" ON public.puzzles;
DROP POLICY IF EXISTS "Public insert/update puzzles" ON public.puzzles;
DROP POLICY IF EXISTS "Public read leaderboard" ON public.leaderboard;
DROP POLICY IF EXISTS "Public insert leaderboard" ON public.leaderboard;
DROP POLICY IF EXISTS "Public all user_accounts" ON public.user_accounts;
DROP POLICY IF EXISTS "Public all profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon_select_puzzles" ON public.puzzles;
DROP POLICY IF EXISTS "anon_select_leaderboard" ON public.leaderboard;
DROP POLICY IF EXISTS "anon_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "anon_insert_leaderboard" ON public.leaderboard;

-- Puzzles: publik hanya bisa baca non-draft
CREATE POLICY "anon_select_puzzles" ON public.puzzles
  FOR SELECT
  USING (COALESCE(is_draft, false) = false);

-- Leaderboard: publik baca saja
CREATE POLICY "anon_select_leaderboard" ON public.leaderboard
  FOR SELECT
  USING (true);

-- Profiles: publik baca field non-sensitif (tabel ini tidak menyimpan password)
CREATE POLICY "anon_select_profiles" ON public.profiles
  FOR SELECT
  USING (true);

-- user_accounts: TIDAK ada policy anon (deny by default saat RLS on)
-- Semua write puzzles / accounts / comments dilakukan lewat backend + service_role.

-- Catatan: jika Anda masih memakai anon key di server (tidak disarankan),
-- sementara bisa menambah policy service-only lewat role supabase_admin.
-- Pastikan env Vercel memakai SUPABASE_SERVICE_ROLE_KEY untuk backend.
