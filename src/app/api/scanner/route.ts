import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export async function GET() {
  try {
    const resp = await fetch(`${BACKEND_URL}/scanner`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });

    if (!resp.ok) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "s-maxage=10" },
      });
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json([], {
      headers: { "Cache-Control": "s-maxage=10" },
    });
  }
}
