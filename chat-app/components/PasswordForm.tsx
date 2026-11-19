"use client";

import { useState, FormEvent } from "react";
import { changePassword } from "@/utils/profile";
import { usernameToEmail } from "@/utils/auth";

export default function PasswordForm({ username }: { username: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak cocok.");
      return;
    }

    setSaving(true);
    try {
      const { error: changeError } = await changePassword(
        currentPassword,
        newPassword,
        usernameToEmail(username)
      );
      setSaving(false);
      if (changeError) {
        setError(changeError);
        return;
      }
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Terjadi kesalahan, coba lagi.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Ganti Password</h2>
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Password lama"
        className="rounded border px-3 py-2"
        required
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="Password baru"
        className="rounded border px-3 py-2"
        required
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Konfirmasi password baru"
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">Password berhasil diubah.</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Ganti Password"}
      </button>
    </form>
  );
}
