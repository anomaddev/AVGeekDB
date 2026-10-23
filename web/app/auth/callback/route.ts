import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/supabase/redirect";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  try {
    const supabase = await createClient();
    const code = url.searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
    const tokenHash = url.searchParams.get("token_hash");
    const type = url.searchParams.get("type");
    if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
      const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  } catch {
    // Fall through to the login error.
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
