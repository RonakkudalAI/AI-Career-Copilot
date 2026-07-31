import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const requested = url.searchParams.get("next") || "/dashboard"; const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  if (code) {
    const supabase = await createClient();
    const { error } = supabase ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("Supabase is not configured") };
    if (error) return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", url.origin));
  }
  return NextResponse.redirect(new URL(code ? next : "/sign-in?error=oauth_failed", url.origin));
}
