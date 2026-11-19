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

-- MESSAGES TABLE
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
