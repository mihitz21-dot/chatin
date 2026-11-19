import Image from "next/image";
import { Message } from "@/utils/messages";

export default function ChatBubble({
  message,
  isOwn,
  avatarUrl,
}: {
  message: Message;
  isOwn: boolean;
  avatarUrl?: string | null;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
        {avatarUrl && (
          <Image src={avatarUrl} alt={message.name} width={32} height={32} />
        )}
      </div>
      <div
        className={`max-w-xs rounded-2xl px-3 py-2 ${
          isOwn ? "bg-green-700 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="text-xs opacity-70">
          {message.name} · {time}
        </p>
        {message.type === "text" && <p>{message.content}</p>}
        {message.type === "image" && (
          <Image src={message.content} alt="gambar" width={240} height={240} className="mt-1 rounded" />
        )}
        {message.type === "video" && (
          <video src={message.content} controls className="mt-1 max-w-full rounded" />
        )}
      </div>
    </div>
  );
}
