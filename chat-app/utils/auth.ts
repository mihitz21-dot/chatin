import { supabase } from "../lib/supabase";
import { isValidUsername } from "./validation";

export const SYNTHETIC_EMAIL_DOMAIN = "chatapp.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

function isUsernameTakenError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code?.toLowerCase() ?? "";
  return message.includes("already registered") || code === "user_already_exists";
}

export async function registerUser(
  username: string,
  password: string
): Promise<{ error: string | null }> {
  if (!isValidUsername(username)) {
    return { error: "Username harus 3-20 karakter huruf, angka, atau underscore." };
  }

  const normalized = username.trim().toLowerCase();

  const { data, error: signUpError } = await supabase.auth.signUp({
    email: usernameToEmail(normalized),
    password,
  });

  if (signUpError || !data.user) {
    if (isUsernameTakenError(signUpError)) {
      return { error: "Username sudah dipakai." };
    }
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
