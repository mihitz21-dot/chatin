"use client";

import { useRef, useState, FormEvent } from "react";
import MediaPreview from "./MediaPreview";
import { uploadChatMedia } from "@/utils/upload";
import { sendMessage } from "@/utils/messages";

export default function MessageInput({
  uid,
  name,
  onSent,
}: {
  uid: string;
  name: string;
  onSent?: () => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (file) {
      setSending(true);
      const { url, error: uploadError, type } = await uploadChatMedia(file, uid);
      if (uploadError || !url || !type) {
        setSending(false);
        setError(uploadError ?? "Gagal mengunggah file.");
        return;
      }
      const { error: sendError } = await sendMessage(uid, name, type, url);
      setSending(false);
      if (sendError) {
        setError(sendError);
        return;
      }
      setFile(null);
      onSent?.();
      return;
    }

    if (!text.trim()) return;
    setSending(true);
    const { error: sendError } = await sendMessage(uid, name, "text", text.trim());
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setText("");
    onSent?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t p-3">
      {file && (
        <MediaPreview file={file} onCancel={() => setFile(null)} disabled={sending} />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="text-xl disabled:opacity-50"
          aria-label="Lampirkan file"
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            if (sending) return;
            setFile(e.target.files?.[0] ?? null);
          }}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tulis pesan..."
          className="flex-1 rounded border px-3 py-2"
          disabled={!!file}
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Kirim
        </button>
      </div>
    </form>
  );
}
