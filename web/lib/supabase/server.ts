import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_SETUP_HINT, supabasePublishableKey, supabaseUrl } from "./env";

/** Per-request server client. One instance per request so a token refresh is not raced. */
export const createClient = cache(async () => {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) throw new Error(`Supabase is not configured. ${SUPABASE_SETUP_HINT}`);
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the session.
        }
      },
    },
  });
});
