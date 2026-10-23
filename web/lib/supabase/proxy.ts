import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./env";

function redirectPreservingSession(request: NextRequest, supabaseResponse: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  const redirect = NextResponse.redirect(url);
  for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

/** Refresh the auth cookie. Public pages stay public; dashboard and admin require a verified session. */
export async function updateSession(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabasePublishableKey();
  if (!url || !key) return NextResponse.next({ request });

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([header, value]) => supabaseResponse.headers.set(header, value));
      },
    },
  });

  // Nothing between createServerClient and getClaims: a refresh has to land on this response.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    signedIn = false;
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && (path.startsWith("/dashboard") || path.startsWith("/admin"))) {
    return redirectPreservingSession(request, supabaseResponse, path);
  }
  return supabaseResponse;
}
