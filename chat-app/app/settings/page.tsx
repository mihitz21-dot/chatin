"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import ProfileForm from "@/components/ProfileForm";
import PasswordForm from "@/components/PasswordForm";
import DeleteAccountModal from "@/components/DeleteAccountModal";
import { supabase } from "@/lib/supabase";
import { logoutUser } from "@/utils/auth";

type Profile = { id: string; username: string; name: string; avatar_url: string | null };

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
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

      if (profileError || !userRow) {
        setError("Gagal memuat profil. Coba logout dan login kembali.");
        return;
      }

      setProfile(userRow as Profile);
    }
    init();
  }, [router]);

  async function handleLogout() {
    await logoutUser();
    router.push("/");
  }

  async function handleDeleteAccount() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) return;

    const response = await fetch("/api/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ uid: session.user.id }),
    });
    const result = await response.json();
    if (result.error) {
      setDeleteError(result.error);
      throw new Error(result.error);
    }
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
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <Logo size={32} />
        <Link href="/chat" className="text-sm text-green-700 underline">
          Kembali ke Chat
        </Link>
      </header>

      <ProfileForm
        uid={profile.id}
        initialName={profile.name}
        initialAvatarUrl={profile.avatar_url}
        onSaved={(name, avatarUrl) => setProfile({ ...profile, name, avatar_url: avatarUrl })}
      />

      <hr />

      <PasswordForm username={profile.username} />

      <hr />

      <div>
        <h2 className="text-lg font-semibold text-red-600">Hapus Akun</h2>
        {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
        <button
          onClick={() => setShowDeleteModal(true)}
          className="mt-2 rounded border border-red-600 px-4 py-2 text-red-600"
        >
          Hapus Akun
        </button>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          username={profile.username}
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </main>
  );
}
