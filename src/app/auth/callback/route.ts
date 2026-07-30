import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const requested = url.searchParams.get("next") || "/dashboard"; const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  if (code) { const supabase = await createClient(); await supabase?.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(new URL(code ? next : "/sign-in?error=oauth_failed", url.origin));
}
