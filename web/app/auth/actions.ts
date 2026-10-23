"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/redirect";

type AuthResult = { error: string } | { message: string };

function credentials(formData: FormData): { email: string; password: string } | { error: string } {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { error: "Enter a valid email." };
  if (password.length < 8 || password.length > 72) return { error: "Password must be 8–72 characters." };
  return { email, password };
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://127.0.0.1:3000";
}

async function clientOrError(): Promise<{ error: string } | { supabase: Awaited<ReturnType<typeof createClient>> }> {
  try {
    return { supabase: await createClient() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Supabase is not configured." };
  }
}

export async function signIn(formData: FormData): Promise<AuthResult | void> {
  const creds = credentials(formData);
  if ("error" in creds) return creds;
  const ready = await clientOrError();
  if ("error" in ready) return ready;
  const { error } = await ready.supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(formData: FormData): Promise<AuthResult | void> {
  const creds = credentials(formData);
  if ("error" in creds) return creds;
  const ready = await clientOrError();
  if ("error" in ready) return ready;
  const origin = await siteOrigin();
  // Captcha stays off until Turnstile is wired (options.captchaToken).
  const { data, error } = await ready.supabase.auth.signUp({
    email: creds.email,
    password: creds.password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/dashboard");
  return { message: "Check your email to confirm your account." };
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Leave the session page even if Auth is unreachable.
  }
  redirect("/");
}
