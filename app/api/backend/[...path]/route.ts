import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:7860";

function buildTargetUrl(path: string[], search: string): string {
  const base = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
  const joinedPath = path.join("/");
  return `${base}/${joinedPath}${search}`;
}

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(path, request.nextUrl.search);

  const headers = new Headers(request.headers); 
  headers.delete("host");

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "backend_unreachable",
        detail: error instanceof Error ? error.message : "Unknown proxy error",
      },
      { status: 502 }
    );
  }
}

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { path } = await context.params;
  return proxy(request, path);
}