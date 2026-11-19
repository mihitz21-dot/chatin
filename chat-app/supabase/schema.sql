-- Grant base table privileges: RLS policies alone don't grant access without this,
-- since Supabase only auto-grants it for tables created through the Table Editor UI,
-- not through raw SQL.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- USERS TABLE
CREATE TABLE users (
  id          uuid REFERENCES auth.users PRIMARY KEY,
  username    text UNIQUE NOT NULL,
  name        text NOT NULL,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read users"
  ON users FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert own user"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "update own user"
  ON users FOR UPDATE
  USING (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE ON users TO authenticated;

-- CONVERSATIONS TABLE (private 1-to-1 chats between two users)
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_id   uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  user_b_id   uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON conversations TO authenticated;

CREATE POLICY "read own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "insert own conversation"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- MESSAGES TABLE
CREATE TABLE messages (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid              uuid REFERENCES auth.users NOT NULL,
  name             text NOT NULL,
  type             text CHECK (type IN ('text','image','video')),
  content          text NOT NULL,
  conversation_id  uuid REFERENCES conversations ON DELETE CASCADE NOT NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX ON messages (conversation_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT ON messages TO authenticated;

-- STORAGE: media bucket (chat images/videos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);

CREATE POLICY "upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- STORAGE: avatars bucket (profile pictures)
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
