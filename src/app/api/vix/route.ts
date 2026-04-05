import { NextResponse } from "next/server";
import { getVixTermStructure } from "@/lib/cboe";

export async function GET() {
  const data = await getVixTermStructure();
  if (!data) {
    return NextResponse.json({ error: "VIX data not found" }, { status: 502 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
  });
}
