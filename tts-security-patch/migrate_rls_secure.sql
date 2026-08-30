-- =========================================================
-- MIGRASI RLS AMAN — jalankan di Supabase SQL Editor
-- Setelah ini, pastikan backend Vercel memakai
-- SUPABASE_SERVICE_ROLE_KEY (bukan anon key) untuk write.
-- =========================================================

ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "anon_select_puzzles" ON public.puzzles
  FOR SELECT
  USING (COALESCE(is_draft, false) = false);

CREATE POLICY "anon_select_leaderboard" ON public.leaderboard
  FOR SELECT
  USING (true);

CREATE POLICY "anon_select_profiles" ON public.profiles
  FOR SELECT
  USING (true);

-- user_accounts: tidak ada policy anon → deny by default
