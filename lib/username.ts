// Single source of truth for username handling. Usernames are mapped to a hidden
// synthetic email so Supabase Auth (email/password under the hood) can be used
// without ever showing an email field to the user (see CLAUDE.md section 3).

// One constant — easy to change if Supabase ever rejects "@wc.local".
export const AUTH_EMAIL_DOMAIN = "wc.local";

// Trim + lowercase. Every comparison and the synthetic email use the normalized
// form, so "Vedang" and "vedang " resolve to the same account.
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

// Map a username to the synthetic email Supabase actually stores.
export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${AUTH_EMAIL_DOMAIN}`;
}

// Returns an error message, or null if the username is valid.
// Rules: 3–20 chars, only a–z, 0–9, underscore (checked AFTER normalize).
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3) return "Username must be at least 3 characters.";
  if (u.length > 20) return "Username must be 20 characters or fewer.";
  if (!/^[a-z0-9_]+$/.test(u)) {
    return "Username can only use letters, numbers, and underscores.";
  }
  return null;
}

// Returns an error message, or null if the name is valid.
export function validateName(raw: string): string | null {
  const n = raw.trim();
  if (n.length < 1) return "Please enter your name.";
  if (n.length > 40) return "Name must be 40 characters or fewer.";
  return null;
}
