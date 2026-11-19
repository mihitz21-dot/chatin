# CurhatIn — Private 1-on-1 Conversations

## Ringkasan

CurhatIn saat ini memakai satu room chat global: semua user yang login
melihat dan mengirim ke `messages` table yang sama. Fitur ini mengganti
model itu dengan percakapan privat 1-ke-1 antar dua user — seperti
WhatsApp, bukan lagi group chat terbuka.

## Keputusan Desain

- Room global **dihapus total**, diganti sepenuhnya dengan percakapan
  privat.
- User memulai percakapan baru dengan memilih dari **daftar semua user
  terdaftar** (bukan search box).
- Halaman utama setelah login (`/chat`) menampilkan **daftar percakapan
  yang sudah ada** (gaya WhatsApp: nama lawan bicara + preview pesan
  terakhir), dengan tombol untuk mulai percakapan baru.
- Hanya mendukung percakapan 1-ke-1. Tidak ada group chat (YAGNI — tidak
  diminta, dan skema di bawah sengaja tidak dirancang untuk itu).

## Skema Database

### Tabel `conversations` (baru)

```sql
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_id   uuid REFERENCES auth.users NOT NULL,
  user_b_id   uuid REFERENCES auth.users NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_a_id, user_b_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON conversations TO authenticated;

CREATE POLICY "read own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "insert own conversation"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);
```

**Urutan kanonik:** untuk mencegah dua baris terpisah untuk pasangan yang
sama (A↔B dan B↔A), aplikasi SELALU menyimpan `user_a_id` sebagai UUID
yang secara leksikografis lebih kecil, dan `user_b_id` yang lebih besar.
Perbandingan ini dilakukan di client (`utils/conversations.ts`) sebelum
query, bukan di database.

### Tabel `messages` (ubah)

Tambah kolom wajib `conversation_id`, pesan tidak lagi global:

```sql
ALTER TABLE messages ADD COLUMN conversation_id uuid REFERENCES conversations NOT NULL;
```

RLS lama (`auth.role() = 'authenticated'`) diganti karena sudah tidak
sesuai — siapa saja yang login bisa baca semua pesan, padahal sekarang
harus privat per-conversation:

```sql
DROP POLICY "read messages" ON messages;
DROP POLICY "insert own message" ON messages;

CREATE POLICY "read own conversation messages"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

CREATE POLICY "insert own conversation messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = uid
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );
```

Realtime publication perlu di-refresh (sudah ada untuk `messages`, tidak
perlu diulang) — filter per-conversation dilakukan di level subscription
client (`postgres_changes` dengan `filter: "conversation_id=eq.<id>"`),
bukan di publication.

## Halaman & Alur

### `/chat` — Daftar Percakapan (ubah total dari sebelumnya)

- Menampilkan list percakapan milik user yang login: nama/username lawan
  bicara, avatar, dan preview pesan terakhir (potongan teks atau label
  "📷 Gambar" / "🎥 Video" untuk media).
- Diurutkan dari pesan terbaru.
- Tombol **"Mulai Percakapan Baru"** membuka halaman/daftar pilih user
  (lihat di bawah).
- Klik satu item percakapan → navigasi ke `/chat/[conversationId]`.
- Header tetap ada: Logo, link Settings, tombol Logout — dipindah dari
  chat-thread page yang lama.

### `/chat/new` — Pilih User untuk Mulai Percakapan (baru)

- Menampilkan semua user terdaftar di tabel `users`, KECUALI diri
  sendiri.
- Klik salah satu user:
  1. Cek apakah conversation dengan pasangan (diri sendiri, user itu)
     sudah ada (`getOrCreateConversation`).
  2. Kalau sudah ada → navigasi ke `/chat/[conversationId]` yang sudah
     ada.
  3. Kalau belum ada → insert baru ke `conversations`, lalu navigasi ke
     `/chat/[conversationId]` yang baru dibuat.

### `/chat/[conversationId]` — Thread Chat (dipindah dari `/chat` lama)

- UI bubble chat yang sudah ada (ChatBubble, MessageInput, MediaPreview)
  dipakai ulang tanpa perubahan visual.
- Sebelum render, verifikasi `conversationId` ini benar-benar milik user
  yang login (query `conversations` dengan `.eq("id", conversationId)` —
  RLS otomatis mengembalikan kosong kalau bukan miliknya → redirect ke
  `/chat`).
- `fetchMessages(conversationId)` dan `subscribeToMessages(conversationId,
  onInsert)` difilter ke conversation ini saja.
- `MessageInput` dapat prop baru `conversationId`, diteruskan ke
  `sendMessage(conversationId, uid, name, type, content)`.
- Header menampilkan nama/avatar lawan bicara (bukan nama app), plus
  tombol "← Kembali" ke `/chat`.

## Perubahan ke Kode yang Sudah Ada

### `utils/messages.ts`

- `sendMessage(conversationId, uid, name, type, content)` — tambah
  parameter pertama, insert menyertakan `conversation_id`.
- `fetchMessages(conversationId)` — tambah filter
  `.eq("conversation_id", conversationId)`.
- `subscribeToMessages(conversationId, onInsert)` — tambah filter pada
  channel: `{ event: "INSERT", schema: "public", table: "messages",
  filter: "conversation_id=eq.<conversationId>" }`.

### `utils/conversations.ts` (baru)

- `type ConversationSummary = { id: string; otherUser: { id: string;
  username: string; name: string; avatar_url: string | null }; lastMessage:
  { content: string; type: Message["type"]; created_at: string } | null }`
- `fetchConversations(myUid: string): Promise<ConversationSummary[]>` —
  join `conversations` dengan `users` (untuk info lawan bicara) dan ambil
  pesan terakhir per conversation.
- `fetchOtherUsers(myUid: string): Promise<{id: string; username: string;
  name: string; avatar_url: string | null}[]>` — semua baris `users`
  kecuali milik sendiri, untuk halaman `/chat/new`.
- `getOrCreateConversation(myUid: string, otherUid: string): Promise<{id:
  string; error: string | null}>` — urutkan `myUid`/`otherUid` secara
  leksikografis jadi `user_a_id`/`user_b_id`, cek existing lewat SELECT,
  kalau tidak ada insert baru.

### `components/MessageInput.tsx`

- Tambah prop `conversationId: string`, diteruskan ke `sendMessage`.

### `components/ChatBubble.tsx`

- Tidak berubah — tetap render per `Message`, tidak perlu tahu soal
  conversation.

## Testing

- Dua browser/sesi berbeda (dua akun berbeda): akun A mulai percakapan
  dengan akun B dari `/chat/new` → masuk ke thread baru.
- Akun A kirim pesan → muncul realtime di sesi B (yang sedang membuka
  thread yang sama), dan muncul sebagai preview terbaru di `/chat` milik
  B kalau sedang di halaman daftar.
- Akun C (pihak ketiga, tidak terlibat) tidak bisa mengakses
  `/chat/[id]` milik percakapan A↔B — redirect ke `/chat` karena RLS
  mengembalikan baris kosong.
- Memilih user yang sama dua kali dari `/chat/new` tidak membuat
  conversation duplikat — selalu kembali ke thread yang sama.
- Field `content` yang berisi gambar/video tetap tervalidasi dan
  terupload sesuai aturan lama (format & ukuran, lihat spec awal).

## Scope yang Tidak Berubah

Autentikasi (username/password sintetis), upload media, validasi file,
edit profil/avatar, ganti password, hapus akun — semua tetap seperti
spec sebelumnya, tidak terpengaruh perubahan ini.
