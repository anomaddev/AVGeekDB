"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Browser client. Session cookies are readable by the server proxy. Null when env is unset. */
export function createClient() {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
