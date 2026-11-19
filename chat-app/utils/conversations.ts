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
  created_at: string;
};

export async function fetchOtherUsers(
  myUid: string
): Promise<{ data: OtherUser[]; error: string | null }> {
  const { data, error } = await supabase
    .from("users")
    .select("id, username, name, avatar_url")
    .neq("id", myUid);
  return { data: (data as OtherUser[]) ?? [], error: error ? error.message : null };
}

function canonicalOrder(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export async function getOrCreateConversation(
  myUid: string,
  otherUid: string
): Promise<{ id: string | null; error: string | null }> {
  const [userAId, userBId] = canonicalOrder(myUid, otherUid);

  const { data: existing, error: existingError } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_a_id", userAId)
    .eq("user_b_id", userBId)
    .maybeSingle();

  if (existingError) {
    return { id: null, error: existingError.message };
  }

  if (existing) {
    return { id: existing.id, error: null };
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ user_a_id: userAId, user_b_id: userBId })
    .select()
    .single();

  if (error || !created) {
    // Unique-violation (23505) means a concurrent request already created
    // this conversation; re-fetch it instead of surfacing a raw DB error.
    if (error?.code === "23505") {
      const { data: retryExisting, error: retryError } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_a_id", userAId)
        .eq("user_b_id", userBId)
        .maybeSingle();

      if (!retryError && retryExisting) {
        return { id: retryExisting.id, error: null };
      }
    }

    return { id: null, error: error?.message ?? "Gagal membuat percakapan." };
  }

  return { id: created.id, error: null };
}

export async function fetchConversations(
  myUid: string
): Promise<{ data: ConversationSummary[]; error: string | null }> {
  const { data: conversations, error: conversationsError } = await supabase
    .from("conversations")
    .select("id, user_a_id, user_b_id, created_at")
    .or(`user_a_id.eq.${myUid},user_b_id.eq.${myUid}`);

  if (conversationsError) {
    return { data: [], error: conversationsError.message };
  }

  if (!conversations || conversations.length === 0) return { data: [], error: null };

  const otherUids = conversations.map((c) =>
    c.user_a_id === myUid ? c.user_b_id : c.user_a_id
  );

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, username, name, avatar_url")
    .in("id", otherUids);

  if (usersError) {
    return { data: [], error: usersError.message };
  }

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
      created_at: conv.created_at,
    });
  }

  // Sorted by newest message first (falling back to the conversation's own
  // created_at for conversations with no messages yet).
  summaries.sort((a, b) => {
    const aKey = a.lastMessage?.created_at ?? a.created_at;
    const bKey = b.lastMessage?.created_at ?? b.created_at;
    return new Date(bKey).getTime() - new Date(aKey).getTime();
  });

  return { data: summaries, error: null };
}
