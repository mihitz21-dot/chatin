import Link from "next/link";
import Image from "next/image";
import { ConversationSummary } from "@/utils/conversations";

function previewText(lastMessage: ConversationSummary["lastMessage"]): string {
  if (!lastMessage) return "Belum ada pesan";
  if (lastMessage.type === "image") return "📷 Gambar";
  if (lastMessage.type === "video") return "🎥 Video";
  return lastMessage.content;
}

export default function ConversationListItem({
  conversation,
}: {
  conversation: ConversationSummary;
}) {
  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="flex items-center gap-3 border-b p-3 hover:bg-gray-50"
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-200">
        {conversation.otherUser.avatar_url && (
          <Image
            src={conversation.otherUser.avatar_url}
            alt={conversation.otherUser.name}
            width={40}
            height={40}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{conversation.otherUser.name}</p>
        <p className="truncate text-sm text-gray-500">
          {previewText(conversation.lastMessage)}
        </p>
      </div>
    </Link>
  );
}
