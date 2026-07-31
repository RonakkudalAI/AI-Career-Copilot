import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type RouteContext = { params: Promise<{ bucket: string; path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { bucket, path } = await context.params;
  const session = (await cookies()).get("career_copilot_session")?.value;
  if (!session) return NextResponse.json({ error: { message: "Authentication is required." } }, { status: 401 });

  const upstream = `${apiBase()}/api/v1/files/${encodeURIComponent(bucket)}/${path.map(encodeURIComponent).join("/")}`;
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
