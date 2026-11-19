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
      const { data, error: fetchError } = await fetchConversations(sessionData.session.user.id);
      if (fetchError) {
        setError("Gagal memuat daftar percakapan.");
        return;
      }
      setConversations(data);
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
          Belum ada percakapan. Klik &quot;Mulai Percakapan Baru&quot; untuk mulai chat.
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
