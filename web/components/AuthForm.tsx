"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Turnstile } from "./Turnstile";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const [msg, setMsg] = useState("");
  async function submit(fd: FormData) {
    const sb = supabaseBrowser();
    if (!sb) return setMsg("Supabase not configured (see .env.example). Auth is stubbed in dev.");
    const email = String(fd.get("email")), password = String(fd.get("password"));
    // TODO: pass Turnstile token via options.captchaToken (enable CAPTCHA in Supabase Auth settings).
    const { error } = mode === "signup" ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
    setMsg(error ? error.message : mode === "signup" ? "Check your email to confirm." : "Signed in. Go to /dashboard.");
  }
  return (
    <form action={submit}>
      <p><input name="email" type="email" placeholder="email" required /></p>
      <p><input name="password" type="password" placeholder="password" required minLength={8} /></p>
      {mode === "signup" && <Turnstile />}
      <button type="submit">{mode === "signup" ? "Create account" : "Log in"}</button>
      <p>{msg}</p>
    </form>
  );
}
