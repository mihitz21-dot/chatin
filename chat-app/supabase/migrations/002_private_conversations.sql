-- Conversations table
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_id   uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  user_b_id   uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON conversations TO authenticated;

CREATE POLICY "read own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "insert own conversation"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Existing test messages have no conversation to belong to; clear them
-- before adding the NOT NULL column. This is test data from development,
-- not real user data.
TRUNCATE TABLE messages;

ALTER TABLE messages ADD COLUMN conversation_id uuid REFERENCES conversations ON DELETE CASCADE NOT NULL;

CREATE INDEX ON messages (conversation_id, created_at);

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
