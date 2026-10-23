import { KeySignupForm } from "@/components/KeySignupForm";

export const metadata = { title: "Get an API key - AVGeekDB" };

export default function Page() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  return (
    <main>
      <h1>Get a free API key</h1>
      <p>Enter your email and a name for the key. The key is shown once; store it somewhere safe.</p>
      {siteKey ? <KeySignupForm siteKey={siteKey} /> : <p>Sign-up is not configured (NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing).</p>}
    </main>
  );
}
