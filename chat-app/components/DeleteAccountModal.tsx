"use client";

import { useState } from "react";

export default function DeleteAccountModal({
  username,
  onConfirm,
  onClose,
}: {
  username: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === "HAPUS";

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus akun.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded bg-white p-6">
        <h2 className="text-lg font-semibold text-red-600">Hapus Akun</h2>
        <p className="mt-2 text-sm">
          Tindakan ini tidak bisa dibatalkan. Semua pesan dan data akun{" "}
          <strong>{username}</strong> akan dihapus permanen. Ketik{" "}
          <strong>HAPUS</strong> untuk melanjutkan.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-3 w-full rounded border px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-4 py-2">
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canDelete || deleting}
            className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {deleting ? "Menghapus..." : "Hapus Akun"}
          </button>
        </div>
      </div>
    </div>
  );
}
