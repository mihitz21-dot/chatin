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
  uid: string,
  name: string,
  type: Message["type"],
  content: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("messages").insert({ uid, name, type, content });
  return { error: error ? error.message : null };
}

export async function fetchMessages(): Promise<Message[]> {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as Message[]) ?? [];
}

export function subscribeToMessages(onInsert: (message: Message) => void): () => void {
  const channel = supabase
    .channel("messages-realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload: { new: Message }) => onInsert(payload.new)
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}
