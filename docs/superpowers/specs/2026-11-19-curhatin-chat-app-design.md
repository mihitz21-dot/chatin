# CurhatIn — Spesifikasi Website Chat Realtime

## Ringkasan

CurhatIn adalah website chat realtime sederhana dengan autentikasi berbasis
username (bukan email), kirim pesan teks/gambar/video, dan pengaturan akun
(edit profil, ganti password, hapus akun).

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14 (React) |
| Realtime & Auth | Supabase (Realtime + Auth) |
| Storage (media & avatar) | Supabase Storage |
| Database | Supabase PostgreSQL |
| Hosting | Vercel |

## Branding

- Nama aplikasi: **CurhatIn**
- Logo: ilustrasi dinosaurus hijau berkacamata memegang cangkir kopi
  (disimpan di `public/icons/logo.png`), dipakai di halaman Login, Register,
  dan header `/chat`.

## Fitur Utama

### 1. Autentikasi (Username, bukan Email)

Supabase Auth secara native butuh email untuk mendaftar/login. Untuk tetap
memakai Supabase Auth (session, RLS `auth.uid()`, dll) tanpa membangun sistem
auth sendiri, dipakai pendekatan **email sintetis**:

- User hanya mengisi **Username** dan **Password** di UI.
- Sebelum daftar, sistem cek apakah `username` sudah dipakai (query tabel
  `users`).
- Jika tersedia, sistem daftar ke Supabase Auth memakai email sintetis
  `{username}@chatapp.local`, lalu insert baris baru di tabel `users`.
- Login: user isi Username + Password → sistem translate ke email sintetis
  di belakang layar → `signInWithPassword`.
- Logout & session persisten: standar Supabase Auth, tidak berubah dari
  pendekatan email biasa.
- Error "email sudah dipakai" dari Supabase Auth ditangkap dan ditampilkan ke
  user sebagai "username sudah dipakai".

### 2. Chat Realtime

- Pesan terkirim dan muncul langsung tanpa refresh (Supabase Realtime
  subscription pada tabel `messages`).
- Tampilkan nama pengirim + waktu kirim.
- Tampilkan avatar pengirim di bubble (lihat Edit Profil).
- Bubble chat: pesan sendiri (kanan), pesan orang lain (kiri).
- Auto scroll ke pesan terbaru.

### 3. Kirim Gambar

- Tombol attach / icon gambar.
- Preview gambar sebelum kirim.
- Gambar tampil langsung di bubble chat.
- Format: JPG, PNG, GIF, WebP. Maks 5MB.

### 4. Kirim Video

- Tombol attach / icon video.
- Video tampil inline dengan player HTML5.
- Format: MP4, WebM. Maks 20MB.

### 5. Pengaturan Akun (`/settings`)

Diakses dari tombol "Settings" di header halaman `/chat`, di samping tombol
Logout.

#### 5.1 Edit Profil

- Input nama tampilan (boleh berbeda dari username).
- Upload avatar dengan preview sebelum disimpan.
- Avatar disimpan di Supabase Storage bucket `avatars`, path
  `{uid}/{timestamp}-{filename}`.
- Setelah simpan, kolom `name` dan `avatar_url` di tabel `users` ter-update,
  dan avatar baru langsung terlihat di bubble chat berikutnya.

#### 5.2 Ganti Password

- Input password lama (untuk verifikasi via re-login/`signInWithPassword`),
  password baru, dan konfirmasi password baru.
- Memakai Supabase Auth `updateUser({ password })` setelah verifikasi
  berhasil.

#### 5.3 Hapus Akun

- Tombol "Hapus Akun" memunculkan modal konfirmasi yang mengharuskan user
  mengetik ulang username atau kata "HAPUS".
- Proses hapus akun (dijalankan lewat Next.js API Route / server action
  memakai Supabase **service role key**, karena user tidak bisa menghapus
  akunnya sendiri dari client):
  1. Hapus semua pesan milik user di tabel `messages`.
  2. Hapus file avatar milik user di bucket `avatars` (jika ada).
  3. Hapus baris user di tabel `users`.
  4. Hapus akun di Supabase Auth (`admin.deleteUser`).
- Setelah berhasil, user di-logout dan diarahkan ke halaman Login.

## Struktur Halaman

- `/` — Login (Username, Password)
- `/register` — Register (Username, Password, Konfirmasi Password)
- `/chat` — Chat utama (header: Logo CurhatIn | Settings | Logout)
- `/settings` — Edit Profil, Ganti Password, Hapus Akun

## Struktur Database (Supabase PostgreSQL)

### Tabel `users`

```sql
CREATE TABLE users (
  id          uuid REFERENCES auth.users PRIMARY KEY,
  username    text UNIQUE NOT NULL,
  name        text NOT NULL,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Semua user yang login bisa baca data user lain (perlu untuk tampilkan nama/avatar di chat)
CREATE POLICY "read users"
  ON users FOR SELECT
  USING (auth.role() = 'authenticated');

-- User hanya bisa update baris miliknya sendiri
CREATE POLICY "update own user"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Insert baris user baru hanya untuk diri sendiri (saat register)
CREATE POLICY "insert own user"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);
```

Catatan: kolom `email` dari spec awal dihapus karena tidak lagi relevan
(email sintetis hanya dipakai internal oleh Supabase Auth, tidak ditampilkan
ke user).

### Tabel `messages`

```sql
CREATE TABLE messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid         uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  type        text CHECK (type IN ('text','image','video')),
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert own message"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = uid);
```

## Supabase Storage

### Bucket `media` (gambar/video chat)

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);

CREATE POLICY "upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### Bucket `avatars` (foto profil)

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

CREATE POLICY "upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

## Alur Upload Media (gambar/video chat, tidak berubah dari spec awal)

```
User pilih file
  ↓
Validasi ukuran & format
  ↓
Upload ke Supabase Storage (bucket: media, path: {uid}/{timestamp}-{filename})
  ↓
Dapat public URL
  ↓
Simpan URL ke tabel messages
  ↓
Tampil di chat via Realtime subscription
```

## Alur Upload Avatar

```
User pilih file di halaman /settings
  ↓
Preview avatar
  ↓
Validasi ukuran & format (sama seperti gambar chat: JPG/PNG/GIF/WebP, maks 5MB)
  ↓
Upload ke Supabase Storage (bucket: avatars, path: {uid}/{timestamp}-{filename})
  ↓
Dapat public URL
  ↓
Update kolom avatar_url di tabel users
```

## Struktur File Project

```
chat-app/
├── app/
│   ├── page.tsx                ← halaman login
│   ├── register/page.tsx       ← halaman register
│   ├── chat/page.tsx           ← halaman chat utama
│   ├── settings/page.tsx       ← halaman pengaturan akun
│   └── api/
│       └── delete-account/route.ts  ← server route, pakai service role key
├── components/
│   ├── Logo.tsx                ← logo CurhatIn
│   ├── ChatBubble.tsx
│   ├── MessageInput.tsx
│   ├── MediaPreview.tsx
│   ├── ProfileForm.tsx
│   ├── PasswordForm.tsx
│   └── DeleteAccountModal.tsx
├── lib/
│   └── supabase.ts             ← konfigurasi Supabase client
├── utils/
│   ├── auth.ts                 ← login, register, logout, username→email sintetis
│   ├── messages.ts             ← kirim & subscribe pesan
│   ├── upload.ts                ← handle upload media chat
│   └── profile.ts              ← update profil, upload avatar
└── public/
    └── icons/
        └── logo.png            ← logo dinosaurus CurhatIn
```

## Testing

- Register dengan username baru → sukses, redirect ke `/chat`.
- Register dengan username yang sudah dipakai → muncul error "username sudah
  dipakai".
- Login dengan username+password benar → sukses.
- Login dengan password salah → muncul error.
- Kirim pesan teks → muncul realtime di semua sesi yang terbuka.
- Kirim gambar >5MB atau format tidak didukung → ditolak dengan pesan error.
- Kirim video >20MB atau format tidak didukung → ditolak dengan pesan error.
- Edit nama & avatar di `/settings` → berubah di bubble chat berikutnya.
- Ganti password dengan password lama salah → ditolak.
- Ganti password dengan password lama benar → sukses, bisa login dengan
  password baru.
- Hapus akun → semua pesan & avatar milik user terhapus, akun tidak bisa
  login lagi.

## Estimasi Waktu Pengerjaan

| Bagian | Estimasi |
|---|---|
| Setup Supabase + Auth (username via email sintetis) | 3 jam |
| Halaman Login & Register | 2 jam |
| UI Chat + Bubble (+avatar) | 4 jam |
| Realtime Supabase | 2 jam |
| Upload Gambar & Video | 3 jam |
| Halaman Settings (edit profil, ganti password, hapus akun) | 4 jam |
| Testing & Polish | 2 jam |
| **Total** | **~20 jam** |

## Catatan Biaya (Free Tier)

| Layanan | Free Tier |
|---|---|
| Supabase DB (PostgreSQL) | 500 MB |
| Supabase Auth | 50.000 MAU |
| Supabase Storage | 1 GB |
| Supabase Realtime | 200 koneksi bersamaan |
| Vercel Hosting | Unlimited (personal) |

Supabase + Vercel free tier lebih dari cukup untuk project kecil hingga
menengah ini.

## Langkah Setup Supabase + Vercel

1. Buka supabase.com → buat project baru.
2. Buat tabel `users` dan `messages` di Table Editor (lihat skema di atas).
3. Aktifkan **Realtime** pada tabel `messages`.
4. Buat Storage bucket `media` dan `avatars`.
5. Set RLS Policies sesuai section di atas (tabel & storage).
6. Salin Project URL dan anon key ke `lib/supabase.ts`.
7. Push project ke GitHub.
8. Buka vercel.com → import repo GitHub.
9. Tambahkan environment variables Supabase di Vercel (termasuk service role
   key untuk `api/delete-account`, disimpan sebagai server-only env var,
   tidak diekspos ke client).
10. Deploy otomatis setiap push ke `main`.
