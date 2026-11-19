# Private 1-on-1 Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CurhatIn's single global chat room with private 1-on-1 conversations between pairs of users, with a WhatsApp-style conversation list.

**Architecture:** Add a `conversations` table (canonical ordered pair of user ids) and a required `conversation_id` column on `messages`. RLS restricts every read/write to the two members of a conversation. The chat thread UI moves from `/chat` to `/chat/[conversationId]`; `/chat` becomes a conversation list; `/chat/new` lets a user pick someone to start a conversation with.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Tailwind CSS, @supabase/supabase-js, Vitest.

## Global Constraints

- Canonical ordering: when creating/looking up a conversation between two users, `user_a_id` is always the lexicographically smaller UUID and `user_b_id` the larger, decided client-side (never two rows for the same pair in either order).
- `messages.conversation_id` is required (`NOT NULL`); every message belongs to exactly one conversation.
- Only 1-on-1 conversations — no group chat, no UI or schema designed for more than 2 members.
- RLS on both `conversations` and `messages` restricts all access to the two member user ids.
- Existing UI components `ChatBubble`, `MediaPreview`, and `MessageInput`'s internal upload/send logic are reused as-is; only `MessageInput`'s props gain a `conversationId`.
- Realtime subscriptions filter by `conversation_id` at the Supabase channel level (`filter: "conversation_id=eq.<id>"`), not by filtering client-side after receiving all inserts.
- This is a live, already-deployed Supabase project with existing test data in `messages` — the migration must be a new SQL file applied manually by the project owner, not a rewrite of the already-applied `schema.sql` alone (though `schema.sql` is also updated to reflect the final state for future fresh installs).

---

## File Structure

```
chat-app/
├── app/
│   └── chat/
│       ├── page.tsx                      ← MODIFY: becomes conversation list
│       ├── new/page.tsx                  ← CREATE: pick a user to start a conversation
│       └── [conversationId]/page.tsx     ← CREATE: chat thread (moved from old chat/page.tsx)
├── components/
│   ├── ConversationListItem.tsx          ← CREATE
│   └── MessageInput.tsx                  ← MODIFY: add conversationId prop
├── utils/
│   ├── conversations.ts                  ← CREATE
│   └── messages.ts                       ← MODIFY: conversationId params
└── supabase/
    ├── schema.sql                        ← MODIFY: reflects final schema for fresh installs
    └── migrations/
        └── 002_private_conversations.sql ← CREATE: incremental migration for the live project
```

---

### Task 1: Database migration — `conversations` table and `messages.conversation_id`

**Files:**
- Create: `chat-app/supabase/migrations/002_private_conversations.sql`
- Modify: `chat-app/supabase/schema.sql`

**Interfaces:**
- Produces: the `conversations` table and `messages.conversation_id` column that every later task depends on. No code interface — this is infrastructure applied manually in the Supabase SQL editor.

- [ ] **Step 1: Write the incremental migration file**

`chat-app/supabase/migrations/002_private_conversations.sql`:

```sql
-- Conversations table
CREATE TABLE conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a_id   uuid REFERENCES auth.users NOT NULL,
  user_b_id   uuid REFERENCES auth.users NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_a_id, user_b_id)
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

ALTER TABLE messages ADD COLUMN conversation_id uuid REFERENCES conversations NOT NULL;

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

- [ ] **Step 2: Update `schema.sql` to reflect the final state for fresh installs**

In `chat-app/supabase/schema.sql`:
1. After the `users` table's GRANT line, insert the `conversations` table block (same SQL as Step 1's `CREATE TABLE conversations` through its two policies).
2. In the `messages` table's `CREATE TABLE` statement, add `conversation_id  uuid REFERENCES conversations NOT NULL,` as a column (a fresh install has no existing rows, so no `TRUNCATE` is needed there).
3. Replace the `messages` table's two existing policies (`"read messages"`, `"insert own message"`) with the two new ones from Step 1 (`"read own conversation messages"`, `"insert own conversation messages"`).

- [ ] **Step 3: Apply the migration to the live project**

In the Supabase dashboard → SQL Editor, paste and run the contents of `migrations/002_private_conversations.sql` against the already-deployed project (the one already running in production). This empties the `messages` table (test data only) and adds the new table/column/policies.

- [ ] **Step 4: Verify manually**

In Table Editor, confirm the `conversations` table exists with RLS enabled, and that `messages` now has a `conversation_id` column (NOT NULL) and the two new policy names (old policy names gone).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/002_private_conversations.sql supabase/schema.sql
git commit -m "feat: add conversations table and conversation_id on messages for private chat"
```

---

### Task 2: Conversations util

**Files:**
- Create: `chat-app/utils/conversations.ts`
- Test: `chat-app/utils/conversations.test.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`.
- Produces:
  - `type OtherUser = { id: string; username: string; name: string; avatar_url: string | null }`
  - `type ConversationSummary = { id: string; otherUser: OtherUser; lastMessage: { content: string; type: "text" | "image" | "video"; created_at: string } | null }`
  - `fetchOtherUsers(myUid: string): Promise<OtherUser[]>`
  - `fetchConversations(myUid: string): Promise<ConversationSummary[]>`
  - `getOrCreateConversation(myUid: string, otherUid: string): Promise<{ id: string | null; error: string | null }>`
  - Used by Task 6 (`/chat/new`), Task 7 (`/chat/[conversationId]`), and Task 8 (`/chat` list).

- [ ] **Step 1: Write the failing tests**

`chat-app/utils/conversations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOtherUsers, fetchConversations, getOrCreateConversation } from "./conversations";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("fetchOtherUsers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects users excluding myUid", async () => {
    const neq = vi.fn().mockResolvedValue({
      data: [{ id: "u2", username: "budi", name: "Budi", avatar_url: null }],
    });
    const select = vi.fn().mockReturnValue({ neq });
    (supabase.from as any).mockReturnValue({ select });

    const result = await fetchOtherUsers("u1");

    expect(supabase.from).toHaveBeenCalledWith("users");
    expect(select).toHaveBeenCalledWith("id, username, name, avatar_url");
    expect(neq).toHaveBeenCalledWith("id", "u1");
    expect(result).toEqual([{ id: "u2", username: "budi", name: "Budi", avatar_url: null }]);
  });
});

describe("getOrCreateConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("orders ids canonically and returns an existing conversation", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "conv-1" } });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    (supabase.from as any).mockReturnValue({ select });

    const result = await getOrCreateConversation("u2", "u1");

    expect(eqA).toHaveBeenCalledWith("user_a_id", "u1");
    expect(eqB).toHaveBeenCalledWith("user_b_id", "u2");
    expect(result).toEqual({ id: "conv-1", error: null });
  });

  it("creates a new conversation when none exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null });
    const eqB = vi.fn().mockReturnValue({ maybeSingle });
    const eqA = vi.fn().mockReturnValue({ eq: eqB });
    const select = vi.fn().mockReturnValue({ eq: eqA });
    const single = vi.fn().mockResolvedValue({ data: { id: "conv-new" }, error: null });
    const insertSelect = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: insertSelect });
    (supabase.from as any).mockReturnValue({ select, insert });

    const result = await getOrCreateConversation("u1", "u2");

    expect(insert).toHaveBeenCalledWith({ user_a_id: "u1", user_b_id: "u2" });
    expect(result).toEqual({ id: "conv-new", error: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/conversations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the conversations util**

`chat-app/utils/conversations.ts`:

```ts
import { supabase } from "../lib/supabase";
import { Message } from "./messages";

export type OtherUser = {
  id: string;
  username: string;
  name: string;
  avatar_url: string | null;
};

export type ConversationSummary = {
  id: string;
  otherUser: OtherUser;
  lastMessage: { content: string; type: Message["type"]; created_at: string } | null;
};

export async function fetchOtherUsers(myUid: string): Promise<OtherUser[]> {
  const { data } = await supabase
    .from("users")
    .select("id, username, name, avatar_url")
    .neq("id", myUid);
  return (data as OtherUser[]) ?? [];
}

function canonicalOrder(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export async function getOrCreateConversation(
  myUid: string,
  otherUid: string
): Promise<{ id: string | null; error: string | null }> {
  const [userAId, userBId] = canonicalOrder(myUid, otherUid);

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_a_id", userAId)
    .eq("user_b_id", userBId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, error: null };
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_a_id: userAId, user_b_id: userBId })
    .select()
    .single();

  if (error || !created) {
    return { id: null, error: error?.message ?? "Gagal membuat percakapan." };
  }

  return { id: created.id, error: null };
}

export async function fetchConversations(myUid: string): Promise<ConversationSummary[]> {
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, user_a_id, user_b_id")
    .or(`user_a_id.eq.${myUid},user_b_id.eq.${myUid}`);

  if (!conversations || conversations.length === 0) return [];

  const otherUids = conversations.map((c) =>
    c.user_a_id === myUid ? c.user_b_id : c.user_a_id
  );

  const { data: users } = await supabase
    .from("users")
    .select("id, username, name, avatar_url")
    .in("id", otherUids);

  const usersById = new Map((users ?? []).map((u) => [u.id, u as OtherUser]));

  const summaries: ConversationSummary[] = [];
  for (const conv of conversations) {
    const otherUid = conv.user_a_id === myUid ? conv.user_b_id : conv.user_a_id;
    const otherUser = usersById.get(otherUid);
    if (!otherUser) continue;

    const { data: lastMessages } = await supabase
      .from("messages")
      .select("content, type, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(1);

    summaries.push({
      id: conv.id,
      otherUser,
      lastMessage: lastMessages && lastMessages.length > 0 ? (lastMessages[0] as any) : null,
    });
  }

  return summaries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/conversations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/conversations.ts utils/conversations.test.ts
git commit -m "feat: add conversations util (fetch, create, list with last message)"
```

---

### Task 3: Update messages util for conversation scoping

**Files:**
- Modify: `chat-app/utils/messages.ts`
- Modify: `chat-app/utils/messages.test.ts`

**Interfaces:**
- Consumes: `supabase` (unchanged source).
- Produces (signatures change, callers in Tasks 4 and 7 must use the new signatures):
  - `sendMessage(conversationId: string, uid: string, name: string, type: Message["type"], content: string): Promise<{ error: string | null }>`
  - `fetchMessages(conversationId: string): Promise<Message[]>`
  - `subscribeToMessages(conversationId: string, onInsert: (message: Message) => void): () => void`
  - `Message` type unchanged (still has `id, uid, name, type, content, created_at`; `conversation_id` is not needed on the client-side type since each subscription/fetch is already scoped to one conversation).

- [ ] **Step 1: Update the tests for the new signatures**

Replace `chat-app/utils/messages.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage, fetchMessages, subscribeToMessages } from "./messages";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
  },
}));

describe("sendMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a message row scoped to the conversation", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as any).mockReturnValue({ insert });

    const result = await sendMessage("conv-1", "user-1", "budi", "text", "halo");

    expect(supabase.from).toHaveBeenCalledWith("messages");
    expect(insert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      uid: "user-1",
      name: "budi",
      type: "text",
      content: "halo",
    });
    expect(result.error).toBeNull();
  });
});

describe("fetchMessages", () => {
  it("returns ordered messages filtered by conversation", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as any).mockReturnValue({ select });

    const messages = await fetchMessages("conv-1");

    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("conversation_id", "conv-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(messages).toEqual([{ id: "1" }]);
  });
});

describe("subscribeToMessages", () => {
  it("subscribes with a conversation_id filter and returns an unsubscribe fn", () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn().mockReturnThis();
    const unsubscribe = vi.fn();
    (supabase.channel as any).mockReturnValue({ on, subscribe, unsubscribe });

    const onInsert = vi.fn();
    const unsub = subscribeToMessages("conv-1", onInsert);

    expect(supabase.channel).toHaveBeenCalledWith("messages-realtime-conv-1");
    expect(on).toHaveBeenCalledWith(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq.conv-1",
      },
      expect.any(Function)
    );
    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- utils/messages.test.ts`
Expected: FAIL — current implementation's signatures and assertions don't match.

- [ ] **Step 3: Update the implementation**

Replace `chat-app/utils/messages.ts` with:

```ts
import { supabase } from "../lib/supabase";

export type Message = {
  id: string;
  uid: string;
  name: string;
  type: "text" | "image" | "video";
  content: string;
  created_at: string;
};

export async function sendMessage(
  conversationId: string,
  uid: string,
  name: string,
  type: Message["type"],
  content: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, uid, name, type, content });
  return { error: error ? error.message : null };
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data as Message[]) ?? [];
}

export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: Message) => void
): () => void {
  const channel = supabase
    .channel(`messages-realtime-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload: { new: Message }) => onInsert(payload.new)
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- utils/messages.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/messages.ts utils/messages.test.ts
git commit -m "feat: scope sendMessage/fetchMessages/subscribeToMessages to a conversation"
```

---

### Task 4: Update MessageInput for conversation scoping

**Files:**
- Modify: `chat-app/components/MessageInput.tsx`

**Interfaces:**
- Consumes: `sendMessage` with its new signature (Task 3), `uploadChatMedia` (unchanged, from the original plan's Task 8).
- Produces: `MessageInput` now takes `{ conversationId: string; uid: string; name: string; onSent?: () => void }` (added `conversationId`). Used by Task 7 (`/chat/[conversationId]`).

- [ ] **Step 1: Update the component**

In `chat-app/components/MessageInput.tsx`:
1. Add `conversationId: string` to the props type and destructure it alongside `uid`, `name`, `onSent`.
2. Update both `sendMessage(...)` calls (the media-send branch and the text-send branch) to pass `conversationId` as the first argument: `sendMessage(conversationId, uid, name, type, url)` and `sendMessage(conversationId, uid, name, "text", text.trim())`.

- [ ] **Step 2: Verify manually**

Run `npx tsc --noEmit` from inside `chat-app/` — confirm no type errors (this will also surface any caller not yet updated, which is expected until Task 7 updates the chat thread page).

- [ ] **Step 3: Commit**

```bash
git add components/MessageInput.tsx
git commit -m "feat: thread conversationId through MessageInput to sendMessage"
```

---

### Task 5: ConversationListItem component

**Files:**
- Create: `chat-app/components/ConversationListItem.tsx`

**Interfaces:**
- Consumes: `ConversationSummary` type (Task 2).
- Produces: `ConversationListItem` (default export, props `{ conversation: ConversationSummary }`), used by Task 8 (`/chat` list). Renders as a `<Link href={\`/chat/${conversation.id}\`}>`.

- [ ] **Step 1: Implement ConversationListItem**

`chat-app/components/ConversationListItem.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { ConversationSummary } from "@/utils/conversations";

function previewText(lastMessage: ConversationSummary["lastMessage"]): string {
  if (!lastMessage) return "Belum ada pesan";
  if (lastMessage.type === "image") return "📷 Gambar";
  if (lastMessage.type === "video") return "🎥 Video";
  return lastMessage.content;
}

export default function ConversationListItem({
  conversation,
}: {
  conversation: ConversationSummary;
}) {
  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="flex items-center gap-3 border-b p-3 hover:bg-gray-50"
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
        {conversation.otherUser.avatar_url && (
          <Image
            src={conversation.otherUser.avatar_url}
            alt={conversation.otherUser.name}
            width={40}
            height={40}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conversation.otherUser.name}</p>
        <p className="truncate text-sm text-gray-500">
          {previewText(conversation.lastMessage)}
        </p>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify manually**

Compiles with `npx tsc --noEmit`; exercised end-to-end once mounted in Task 8.

- [ ] **Step 3: Commit**

```bash
git add components/ConversationListItem.tsx
git commit -m "feat: add ConversationListItem component"
```

---

### Task 6: `/chat/new` page — pick a user to start a conversation

**Files:**
- Create: `chat-app/app/chat/new/page.tsx`

**Interfaces:**
- Consumes: `supabase` (lib/supabase.ts), `fetchOtherUsers`/`getOrCreateConversation`/`OtherUser` (Task 2), `Logo` (components/Logo.tsx).
- Produces: `/chat/new` route; clicking a user navigates to `/chat/[conversationId]`.

- [ ] **Step 1: Implement the page**

`chat-app/app/chat/new/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabase";
import { fetchOtherUsers, getOrCreateConversation, OtherUser } from "@/utils/conversations";

export default function NewConversationPage() {
  const router = useRouter();
  const [myUid, setMyUid] = useState<string | null>(null);
  const [users, setUsers] = useState<OtherUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/");
        return;
      }
      const uid = sessionData.session.user.id;
      setMyUid(uid);
      setUsers(await fetchOtherUsers(uid));
    }
    init();
  }, [router]);

  async function handleSelect(otherUid: string) {
    if (!myUid) return;
    setError(null);
    setLoadingUserId(otherUid);
    const { id, error: convError } = await getOrCreateConversation(myUid, otherUid);
    setLoadingUserId(null);
    if (convError || !id) {
      setError(convError ?? "Gagal membuat percakapan.");
      return;
    }
    router.push(`/chat/${id}`);
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Logo size={32} />
        <Link href="/chat" className="text-sm text-green-700 underline">
          Kembali
        </Link>
      </header>
      <h1 className="text-lg font-semibold">Mulai Percakapan Baru</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y rounded border">
        {users.map((user) => (
          <li key={user.id}>
            <button
              onClick={() => handleSelect(user.id)}
              disabled={loadingUserId === user.id}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-gray-50 disabled:opacity-50"
            >
              <span>{user.name}</span>
              <span className="text-sm text-gray-500">@{user.username}</span>
            </button>
          </li>
        ))}
        {users.length === 0 && (
          <li className="p-3 text-sm text-gray-500">Belum ada user lain yang terdaftar.</li>
        )}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run `npx tsc --noEmit` and `npx next lint --file app/chat/new/page.tsx` from inside `chat-app/` — confirm both clean. Full behavior verified in the end-to-end check after Task 8.

- [ ] **Step 3: Commit**

```bash
git add app/chat/new/page.tsx
git commit -m "feat: implement /chat/new page to start a conversation"
```

---

### Task 7: `/chat/[conversationId]` — chat thread page

**Files:**
- Create: `chat-app/app/chat/[conversationId]/page.tsx`

**Interfaces:**
- Consumes: `supabase`, `logoutUser` (utils/auth.ts), `Logo` (components/Logo.tsx), `fetchMessages`/`subscribeToMessages`/`Message` (Task 3), `ChatBubble` (components/ChatBubble.tsx, unchanged), `MessageInput` (Task 4, now needs `conversationId`).
- Produces: `/chat/[conversationId]` route — the chat thread, scoped to one conversation. Redirects to `/chat` if the conversation doesn't belong to the logged-in user (RLS returns empty) or if not authenticated.

- [ ] **Step 1: Implement the chat thread page**

This is the content that used to live at `chat-app/app/chat/page.tsx` (from the original plan's Task 12, as later fixed), adapted to: take `conversationId` from the route params, fetch the OTHER user's profile (not just your own) for the header and for avatar lookups, and verify the conversation belongs to the logged-in user before loading messages.

`chat-app/app/chat/[conversationId]/page.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ChatBubble from "@/components/ChatBubble";
import MessageInput from "@/components/MessageInput";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";
import { fetchMessages, subscribeToMessages, Message } from "@/utils/messages";

type Profile = { id: string; username: string; name: string; avatar_url: string | null };

export default function ChatThreadPage() {
  const router = useRouter();
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;

  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/");
        return;
      }
      const uid = sessionData.session.user.id;

      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("id, user_a_id, user_b_id")
        .eq("id", conversationId)
        .maybeSingle();

      if (cancelled) return;

      if (convError || !conversation) {
        router.push("/chat");
        return;
      }

      const otherUid = conversation.user_a_id === uid ? conversation.user_b_id : conversation.user_a_id;

      const { data: myRow, error: myRowError } = await supabase
        .from("users")
        .select("id, username, name, avatar_url")
        .eq("id", uid)
        .single();

      const { data: otherRow } = await supabase
        .from("users")
        .select("id, username, name, avatar_url")
        .eq("id", otherUid)
        .single();

      if (cancelled) return;

      if (myRowError || !myRow) {
        setError("Gagal memuat profil. Coba logout dan login kembali.");
        return;
      }

      setMyProfile(myRow as Profile);
      setOtherUser((otherRow as Profile) ?? null);
      setMessages(await fetchMessages(conversationId));

      if (cancelled) return;

      unsubscribe = subscribeToMessages(conversationId, (message) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      });
    }

    init();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [conversationId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleLogout() {
    await logoutUser();
    router.push("/");
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-red-600">{error}</p>
        <button onClick={handleLogout} className="rounded bg-green-700 px-4 py-2 text-white">
          Logout
        </button>
      </main>
    );
  }

  if (!myProfile) {
    return <main className="flex min-h-screen items-center justify-center">Memuat...</main>;
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Link href="/chat" className="text-green-700">
            ←
          </Link>
          <span className="font-medium">{otherUser?.name ?? "Pengguna"}</span>
        </div>
        <button onClick={handleLogout} className="text-sm text-red-600 underline">
          Logout
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            isOwn={message.uid === myProfile.id}
            avatarUrl={message.uid === myProfile.id ? myProfile.avatar_url : otherUser?.avatar_url}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput conversationId={conversationId} uid={myProfile.id} name={myProfile.name} />
    </main>
  );
}
```

- [ ] **Step 2: Verify manually (end-to-end chat thread)**

With the migration from Task 1 applied to the real Supabase project:
1. Two accounts, two sessions. From session A, go to `/chat/new`, pick account B, land on `/chat/<id>`.
2. From session B, open `/chat`, see the new conversation (verified fully once Task 8 is done) or navigate directly to the same `/chat/<id>` URL.
3. Send a message from A — confirm it appears in B's open thread without refresh (realtime filter works).
4. Try opening the same `/chat/<id>` URL from a THIRD account not part of the conversation — confirm it redirects to `/chat` (RLS blocks the `conversations` row, `convError`/`!conversation` branch fires).
5. Send an image/video — confirm it still works (upload util unchanged) and shows the correct avatar for both participants.

- [ ] **Step 3: Commit**

```bash
git add "app/chat/[conversationId]/page.tsx"
git commit -m "feat: implement chat thread page scoped to one conversation"
```

---

### Task 8: `/chat` — conversation list page (replaces the old chat thread page)

**Files:**
- Modify: `chat-app/app/chat/page.tsx`

**Interfaces:**
- Consumes: `supabase`, `logoutUser` (utils/auth.ts), `Logo` (components/Logo.tsx), `fetchConversations` (Task 2), `ConversationListItem` (Task 5).
- Produces: `/chat` route — the conversation list, replacing the old single-room chat thread entirely.

- [ ] **Step 1: Implement the conversation list page**

`chat-app/app/chat/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import ConversationListItem from "@/components/ConversationListItem";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";
import { fetchConversations, ConversationSummary } from "@/utils/conversations";

export default function ConversationListPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push("/");
        return;
      }
      try {
        setConversations(await fetchConversations(sessionData.session.user.id));
      } catch {
        setError("Gagal memuat daftar percakapan.");
      }
    }
    init();
  }, [router]);

  async function handleLogout() {
    await logoutUser();
    router.push("/");
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Logo size={32} />
        <div className="flex gap-3 text-sm">
          <Link href="/settings" className="text-green-700 underline">
            Settings
          </Link>
          <button onClick={handleLogout} className="text-red-600 underline">
            Logout
          </button>
        </div>
      </header>

      <Link
        href="/chat/new"
        className="rounded bg-green-700 px-4 py-2 text-center text-white"
      >
        Mulai Percakapan Baru
      </Link>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!conversations && !error && <p className="text-gray-500">Memuat...</p>}

      {conversations && conversations.length === 0 && (
        <p className="text-gray-500">
          Belum ada percakapan. Klik "Mulai Percakapan Baru" untuk mulai chat.
        </p>
      )}

      {conversations && conversations.length > 0 && (
        <ul className="divide-y rounded border">
          {conversations.map((conversation) => (
            <ConversationListItem key={conversation.id} conversation={conversation} />
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify manually (end-to-end conversation list)**

1. Log in with an account that has at least one conversation (from Task 7's manual check) — confirm it appears in the list with the other user's name and a last-message preview.
2. Send a new message in that conversation's thread, come back to `/chat` — confirm the preview text updates to the new message.
3. Log in with a brand-new account with no conversations — confirm the empty state message shows.
4. Click "Mulai Percakapan Baru" — confirm it navigates to `/chat/new`.

- [ ] **Step 3: Commit**

```bash
git add app/chat/page.tsx
git commit -m "feat: replace global chat room with conversation list page"
```

---

### Task 9: Update README for the new migration step

**Files:**
- Modify: `chat-app/README.md`

**Interfaces:**
- None — documentation only.

- [ ] **Step 1: Update the setup steps**

In `chat-app/README.md`'s "Setup" section, after the existing `schema.sql` step, add a step noting that projects created before this feature need to additionally run `supabase/migrations/002_private_conversations.sql` in the SQL Editor (new projects get everything from `schema.sql` alone, since it was updated in Task 1).

- [ ] **Step 2: Verify manually**

Read the updated README section once to confirm it accurately describes both the fresh-install path (schema.sql only) and the existing-project upgrade path (schema.sql already applied + run the migration file).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the private-conversations migration step"
```

---

## Full QA Checklist (run after Task 9)

- [ ] Fresh Supabase project: run only `schema.sql` → register 2 users → start a conversation → chat works end to end.
- [ ] Existing live project: run `migrations/002_private_conversations.sql` → old global messages gone (expected, test data) → same 2-user flow works.
- [ ] `/chat` shows the conversation list with correct last-message previews (text truncated, image/video show their emoji label).
- [ ] `/chat/new` lists every other registered user; selecting one either opens the existing conversation or creates a new one (no duplicates on repeated selection).
- [ ] `/chat/[id]` for a conversation you're not part of redirects to `/chat`.
- [ ] Realtime: message sent by A appears instantly for B in the same thread, without refresh.
- [ ] Logo + "CurhatIn" still visible on `/`, `/register`, and the `/chat` header.
