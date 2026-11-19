import { supabase } from "../lib/supabase";
import { isValidUsername } from "./validation";

export const SYNTHETIC_EMAIL_DOMAIN = "chatapp.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export async function registerUser(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  if (!isValidUsername(username)) {
    return { error: "Username harus 3-20 karakter huruf, angka, atau underscore." };
  }

  const normalized = username.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("users")
    .select("username")
    .eq("username", normalized)
    .maybeSingle();

  if (existing) {
    return { error: "Username sudah dipakai." };
  }

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: usernameToEmail(normalized),
    password,
  });

  if (signUpError || !data.user) {
    return { error: signUpError?.message ?? "Gagal mendaftar." };
  }

  const { error: insertError } = await supabase.from("users").insert({
    id: data.user.id,
    username: normalized,
    name: normalized,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  return { error: null };
}

export async function loginUser(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  return { error: error ? error.message : null };
}

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut();
}
