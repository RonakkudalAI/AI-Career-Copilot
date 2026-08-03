import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(new URL(url.searchParams.get("next") || "/sign-in", url.origin));
}
