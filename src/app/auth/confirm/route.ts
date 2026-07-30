import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url); const tokenHash = url.searchParams.get("token_hash"); const type = url.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) { const supabase = await createClient(); const { error } = await supabase!.auth.verifyOtp({ type, token_hash: tokenHash }); if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : "/onboarding", url.origin)); }
  return NextResponse.redirect(new URL("/sign-in?error=verification_failed", url.origin));
}
