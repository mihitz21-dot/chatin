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
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (cancelled) return;
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
      } catch {
        if (cancelled) return;
        setError("Gagal memuat profil. Coba logout dan login kembali.");
      }
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
