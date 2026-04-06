import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const resp = await fetch(`${BACKEND_URL}/cached/${symbol}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    return NextResponse.json(null, { status: resp.status });
  }
  const data = await resp.json();
  return NextResponse.json(data);
}
