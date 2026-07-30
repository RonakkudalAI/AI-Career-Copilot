import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "./config";

const protectedRoots = ["/dashboard", "/resume-analysis", "/resume-builder", "/mock-interview", "/learning", "/jobs", "/settings", "/onboarding"];

export async function updateSession(request: NextRequest) {
  const config = getPublicSupabaseConfig();
  if (!config) {
    if (protectedRoots.some((root) => request.nextUrl.pathname.startsWith(root))) {
      const url = request.nextUrl.clone(); url.pathname = "/sign-in"; url.searchParams.set("error", "configuration_required");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && protectedRoots.some((root) => path.startsWith(root))) {
    const url = request.nextUrl.clone(); url.pathname = "/sign-in"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && ["/sign-in", "/sign-up"].includes(path)) {
    const url = request.nextUrl.clone(); url.pathname = "/dashboard"; url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
