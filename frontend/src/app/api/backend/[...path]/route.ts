import { NextResponse } from "next/server";
import { API_V1_PREFIX, resolveUpstreamApiOrigin } from "@/shared/config";

export const runtime = "nodejs";

async function forward(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  let backendBase: string;
  try {
    backendBase = resolveUpstreamApiOrigin();
  } catch {
    return NextResponse.json(
      { error: { code: "configuration_error", message: "API base URL is not configured." } },
      { status: 500 }
    );
  }
  const incoming = new URL(request.url);
  const target = `${backendBase}${API_V1_PREFIX}/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.arrayBuffer();
    init.duplex = "half";
  }

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "The local API is not reachable. Start npm run dev." } },
      { status: 503 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
