"use client";

import { useState, FormEvent } from "react";
import { uploadAvatar, updateProfile } from "@/utils/profile";

export default function ProfileForm({
  uid,
  initialName,
  initialAvatarUrl,
  onSaved,
}: {
  uid: string;
  initialName: string;
  initialAvatarUrl: string | null;
  onSaved?: (name: string, avatarUrl: string | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setError(null);
    if (selected) setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      let avatarUrl = initialAvatarUrl;
      if (file) {
        const { url, error: uploadError } = await uploadAvatar(file, uid);
        if (uploadError || !url) {
          setSaving(false);
          setError(uploadError ?? "Gagal mengunggah avatar.");
          return;
        }
        avatarUrl = url;
      }

      const { error: updateError } = await updateProfile(uid, name, avatarUrl);
      setSaving(false);
      if (updateError) {
        setError(updateError);
        return;
      }
      setSuccess(true);
      onSaved?.(name, avatarUrl);
    } catch {
      setError("Terjadi kesalahan, coba lagi.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Edit Profil</h2>
      {previewUrl && (
        <img src={previewUrl} alt="avatar preview" className="h-20 w-20 rounded-full object-cover" />
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama"
        className="rounded border px-3 py-2"
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">Profil berhasil disimpan.</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan Profil"}
      </button>
    </form>
  );
}
