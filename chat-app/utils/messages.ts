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
