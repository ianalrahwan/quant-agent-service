import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidProCookie } from "@/lib/pro-cookie";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const body = await request.json();

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  const backendHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (isValidProCookie(cookieValue) && process.env.PRO_TIER_TOKEN) {
    backendHeaders["X-Pro-Token"] = process.env.PRO_TIER_TOKEN;
  }
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    backendHeaders["X-Forwarded-For"] = xff;
  }

  const resp = await fetch(`${BACKEND_URL}/analyze/${symbol}`, {
    method: "POST",
    headers: backendHeaders,
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
