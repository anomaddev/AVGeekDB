import { cache } from "react";
import { createClient } from "./server";
import { isSupabaseConfigured } from "./env";

export type AuthUser = { id: string; email: string | null };

/** Verified session from the auth cookie. Null when signed out or Supabase is not configured. */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || !sub) return null;
    const email = data?.claims?.email;
    return { id: sub, email: typeof email === "string" ? email : null };
  } catch {
    return null;
  }
});

/** Auth-server check for privileged writes (minting and revoking API keys). */
export async function requireAuthUser(): Promise<AuthUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sign in required");
  return { id: data.user.id, email: data.user.email ?? null };
}
