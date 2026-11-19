# CurhatIn

Website chat realtime dengan Next.js 14 dan Supabase.

## Setup

1. Buat project baru di https://supabase.com
2. Jalankan isi `supabase/schema.sql` di SQL Editor Supabase.
3. Aktifkan Realtime untuk tabel `messages` (Database → Replication).
4. Pastikan Storage punya bucket `media` dan `avatars` (dibuat otomatis oleh schema.sql).
5. Salin `.env.local.example` menjadi `.env.local` dan isi:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service_role, JANGAN diekspos ke client)
6. Install dependencies: `npm install`
7. Jalankan secara lokal: `npm run dev`
8. Jalankan unit test: `npm run test`

## Deploy ke Vercel

1. Push repo ke GitHub.
2. Import repo di https://vercel.com
3. Tambahkan environment variables yang sama seperti `.env.local` di pengaturan project Vercel.
4. Deploy — setiap push ke `main` akan otomatis men-deploy ulang.
