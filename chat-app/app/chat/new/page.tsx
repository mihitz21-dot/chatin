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
      const { data, error: fetchError } = await fetchOtherUsers(uid);
      if (fetchError) {
        setError(fetchError);
        return;
      }
      setUsers(data);
    }
    init();
  }, [router]);

  async function handleSelect(otherUid: string) {
    if (!myUid) return;
    setError(null);
    setLoadingUserId(otherUid);
    try {
      const { id, error: convError } = await getOrCreateConversation(myUid, otherUid);
      if (convError || !id) {
        setError(convError ?? "Gagal membuat percakapan.");
        return;
      }
      router.push(`/chat/${id}`);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setLoadingUserId(null);
    }
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
