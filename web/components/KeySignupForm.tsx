"use client";
import Script from "next/script";
import { useState, type FormEvent } from "react";

declare global { interface Window { turnstile?: { reset: (el?: string | HTMLElement) => void } } }

export function KeySignupForm({ siteKey }: { siteKey: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), name: form.get("name"), token: form.get("cf-turnstile-response") }),
      });
      const data = (await res.json()) as { key?: string; error?: string };
      if (res.ok && data.key) setKey(data.key);
      else { setError(data.error ?? "Could not create the API key."); window.turnstile?.reset(); }
    } catch {
      setError("Network error. Please try again."); window.turnstile?.reset();
    } finally { setBusy(false); }
  }

  if (key) {
    return (
      <section>
        <p>Your API key (shown only once):</p>
        <pre><code>{key}</code></pre>
        <p>Send it in the <code>x-api-key</code> header. See the <a href="/docs">docs</a>.</p>
      </section>
    );
  }
  return (
    <form onSubmit={onSubmit}>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <label>Email <input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Name <input name="name" required maxLength={80} placeholder="My app" /></label>
      <div className="cf-turnstile" data-sitekey={siteKey} />
      <button type="submit" disabled={busy}>{busy ? "Creating..." : "Get API key"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
