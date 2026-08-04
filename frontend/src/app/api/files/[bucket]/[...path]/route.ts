import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_V1_PREFIX, resolveUpstreamApiOrigin, SESSION_COOKIE_NAME } from "@/shared/config";

type RouteContext = { params: Promise<{ bucket: string; path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { bucket, path } = await context.params;
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!session) return NextResponse.json({ error: { message: "Authentication is required." } }, { status: 401 });

  const upstream = `${resolveUpstreamApiOrigin()}${API_V1_PREFIX}/files/${encodeURIComponent(bucket)}/${path.map(encodeURIComponent).join("/")}`;
  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: { Authorization: `Bearer ${decodeURIComponent(session)}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: { message: "Could not reach the API." } }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json(
      (await response.json().catch(() => ({ error: { message: "File not found." } }))) as object,
      { status: response.status },
    );
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, no-store",
    },
  });
}
