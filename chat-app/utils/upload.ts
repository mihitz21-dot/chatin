import { supabase } from "../lib/supabase";
import { validateImageFile, validateVideoFile } from "./validation";

type MediaKind = "image" | "video";

function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export async function uploadChatMedia(
  file: File,
  uid: string
): Promise<{ url: string | null; error: string | null; type: MediaKind | null }> {
  const kind = detectKind(file);

  if (kind === "image") {
    const err = validateImageFile(file);
    if (err) return { url: null, error: err, type: null };
  } else if (kind === "video") {
    const err = validateVideoFile(file);
    if (err) return { url: null, error: err, type: null };
  } else {
    return { url: null, error: "Format file tidak didukung.", type: null };
  }

  const path = `${uid}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("media").upload(path, file);

  if (uploadError) {
    return { url: null, error: uploadError.message, type: null };
  }

  const { data } = supabase.storage.from("media").getPublicUrl(path);

  return { url: data.publicUrl, error: null, type: kind };
}
