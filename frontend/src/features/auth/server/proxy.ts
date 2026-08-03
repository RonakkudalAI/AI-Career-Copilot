import { NextResponse, type NextRequest } from "next/server";

const protectedRoots = ["/dashboard", "/resume-analysis", "/resume-builder", "/mock-interview", "/learning", "/jobs", "/settings", "/onboarding"];

export function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = protectedRoots.some((root) => path.startsWith(root));
  const loggedIn = Boolean(request.cookies.get("career_copilot_session")?.value);
  if (isProtected && !loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (loggedIn && ["/sign-in", "/sign-up"].includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
