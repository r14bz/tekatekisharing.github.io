# Patch Keamanan & Stabilitas — Teka Teki Sharing

## File yang diubah
- `server.ts` — backend API
- `src/services/cloudService.ts` — client API calls
- `supabase_schema.sql` — skema + RLS
- `.gitignore` — ignore cache junk
- `migrate_rls_secure.sql` — migrasi RLS untuk DB yang sudah jalan

## Perubahan

### 1. Otorisasi delete/update (ketat)
- Delete/update puzzle **wajib** auth (Bearer token atau `x-author-id` + `x-sync-key` yang cocok dengan akun di server).
- Tanpa identitas → **401**. Identitas tidak cocok → **403**.
- Admin token tetap bisa override.

### 2. Supabase sebagai sumber kebenaran
- Publish menunggu `upsertPuzzleToSupabase` (await).
- GET comments / delete / update mencoba refresh dari Supabase jika cache kosong (cold start).
- `ensureUserAccountsLoaded()` memuat akun dari Supabase sebelum cek kepemilikan.

### 3. RLS diperketat
- Anon: hanya **SELECT** puzzle non-draft, leaderboard, profiles.
- `user_accounts`: tidak ada policy anon (deny).
- Write hanya lewat **service_role** di backend.

### 4. Header inject Supabase dihapus
- Middleware publik yang menerima `x-supabase-url` / `x-supabase-key` dihapus.
- Konfigurasi hanya via env Vercel atau endpoint admin.

### 5. Rate limit
- Play: max 5x / puzzle / IP / menit, 40x / IP / menit
- React: 30x / IP / menit
- Comment: 10x / IP / menit
- Publish: 20x / IP / menit

### 6. Sanitasi komentar
- Strip HTML, netralkan pola XSS, batasi 500 karakter.
- Maks 200 komentar per puzzle.

### 7. Hapus komentar
- Hanya penulis komentar, pemilik puzzle, atau admin.

### 8. Frontend
- `deletePuzzleComment` mengirim header auth.

### 9. Repo
- `.gitignore` untuk `node_modules`, `node-compile-cache/`, `tsx-0/`, dll.
- Folder junk `node-compile-cache` & `tsx-0` boleh dihapus dari repo.

---

## Cara deploy

1. **Copy file** dari folder `patches/` ke root project:
   - `server.ts` → root
   - `cloudService.ts` → `src/services/cloudService.ts`
   - `supabase_schema.sql` → root
   - `.gitignore` → root (merge jika sudah ada)

2. **Vercel env** (wajib):
   ```
   SUPABASE_URL=https://toacghkgrocxfzkstorp.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key dari Supabase>
   SUPABASE_KEY=<sama dengan service role, atau biarkan service role yang dipakai>
   ADMIN_USERNAME=...
   ADMIN_PASSWORD=<password kuat>
   ADMIN_SESSION_SECRET=<random panjang>
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=<anon/publishable key — untuk realtime browser saja>
   ```

3. **Jalankan migrasi RLS** di Supabase SQL Editor:
   - Isi file `migrate_rls_secure.sql`

4. **Commit & push**, biarkan Vercel deploy ulang.

5. **Hapus dari git** (opsional):
   ```bash
   git rm -r node-compile-cache tsx-0
   git add -A && git commit -m "security: auth, RLS, rate-limit, sanitize"
   git push
   ```

## Catatan penting
- Setelah RLS ketat, backend **harus** memakai **service_role key**. Jika masih anon key, write ke Supabase akan gagal.
- User yang belum login (tanpa syncKey/token) **tidak bisa** hapus puzzle di cloud (by design).
- Rate limit bersifat per-instance serverless (bukan global Redis); tetap mengurangi spam sederhana.
