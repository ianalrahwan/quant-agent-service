import { NextRequest, NextResponse } from "next/server";

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

  const resp = await fetch(`${BACKEND_URL}/analyze/${symbol}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  return NextResponse.json(data, { status: resp.status });
}
