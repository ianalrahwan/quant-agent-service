import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getQuote } from "@/lib/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const data = await getQuote(symbol.toUpperCase());
  if (!data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
  });
}
