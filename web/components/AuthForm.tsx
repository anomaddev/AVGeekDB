"use client";
import { useState } from "react";
import { signIn, signUp } from "@/app/auth/actions";
import { Turnstile } from "./Turnstile";

export function AuthForm({ mode, next = "/dashboard" }: { mode: "signup" | "login"; next?: string }) {
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(fd: FormData) {
    setPending(true);
    setMsg("");
    try {
      const result = mode === "signup" ? await signUp(fd) : await signIn(fd);
      if (result && "error" in result) setMsg(result.error);
      else if (result && "message" in result) setMsg(result.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <form action={submit}>
      {mode === "login" && <input type="hidden" name="next" value={next} />}
      <p><input name="email" type="email" placeholder="email" required autoComplete="email" /></p>
      <p><input name="password" type="password" placeholder="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} /></p>
      {mode === "signup" && <Turnstile />}
      <button type="submit" disabled={pending}>{mode === "signup" ? "Create account" : "Log in"}</button>
      <p>{msg}</p>
    </form>
  );
}
