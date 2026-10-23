"use client";
/**
 * Cloudflare Turnstile placeholder. TODO: load https://challenges.cloudflare.com/turnstile/v0/api.js,
 * render the widget with NEXT_PUBLIC_TURNSTILE_SITE_KEY, and verify the token server-side with
 * TURNSTILE_SECRET_KEY (POST https://challenges.cloudflare.com/turnstile/v0/siteverify).
 */
export function Turnstile({ onToken }: { onToken?: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return (
    <div data-sitekey={siteKey} style={{ border: "1px dashed #999", padding: 8, margin: "8px 0", fontSize: 12 }}
      onClick={() => onToken?.("dev-placeholder-token")}>
      Turnstile placeholder {siteKey ? "(site key set, widget TODO)" : "(NEXT_PUBLIC_TURNSTILE_SITE_KEY not set)"}
    </div>
  );
}
