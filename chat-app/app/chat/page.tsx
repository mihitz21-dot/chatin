"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import ChatBubble from "@/components/ChatBubble";
import MessageInput from "@/components/MessageInput";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";
import { fetchMessages, subscribeToMessages, Message } from "@/utils/messages";

type Profile = { id: string; username: string; name: string; avatar_url: string | null };

export default function ChatPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [avatarsByUid, setAvatarsByUid] = useState<Record<string, string | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sessionData.session) {
        router.push("/");
        return;
      }

      const uid = sessionData.session.user.id;
      const { data: userRow, error: profileError } = await supabase
        .from("users")
        .select("id, username, name, avatar_url")
        .eq("id", uid)
        .single();

      if (cancelled) return;
      if (profileError || !userRow) {
        setError("Gagal memuat profil. Coba logout dan login kembali.");
        return;
      }

      setProfile(userRow as Profile);

      const { data: usersData } = await supabase.from("users").select("id, avatar_url");
      if (cancelled) return;
      if (usersData) {
        const map: Record<string, string | null> = {};
        for (const u of usersData as { id: string; avatar_url: string | null }[]) {
          map[u.id] = u.avatar_url;
        }
        setAvatarsByUid(map);
      }

      setMessages(await fetchMessages());
      if (cancelled) return;

      const unsub = subscribeToMessages((message) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      });

      if (cancelled) {
        unsub();
        return;
      }
      unsubscribe = unsub;
    }

    init();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleLogout() {
    await logoutUser();
    router.push("/");
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={handleLogout} className="rounded bg-green-700 px-4 py-2 text-white">
          Logout
        </button>
      </main>
    );
  }

  if (!profile) {
    return <main className="flex min-h-screen items-center justify-center">Memuat...</main>;
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b p-3">
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
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            isOwn={message.uid === profile.id}
            avatarUrl={avatarsByUid[message.uid] ?? null}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <MessageInput uid={profile.id} name={profile.name} />
    </main>
  );
}
