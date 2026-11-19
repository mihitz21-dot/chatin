export const SYNTHETIC_EMAIL_DOMAIN = "chatapp.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
