import { supabase } from "../lib/supabase";
import { validateImageFile } from "./validation";

export async function uploadAvatar(
  file: File,
  uid: string
): Promise<{ url: string | null; error: string | null }> {
  const validationError = validateImageFile(file);
  if (validationError) return { url: null, error: validationError };

  const path = `${uid}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file);
  if (uploadError) return { url: null, error: uploadError.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function updateProfile(
  uid: string,
  name: string,
  avatarUrl: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("users")
    .update({ name, avatar_url: avatarUrl })
    .eq("id", uid);
  return { error: error ? error.message : null };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  email: string
): Promise<{ error: string | null }> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (verifyError) {
    return { error: "Password lama salah." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  return { error: updateError ? updateError.message : null };
}
