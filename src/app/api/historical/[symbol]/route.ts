import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getHistoricalPrices } from "@/lib/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const data = await getHistoricalPrices(symbol.toUpperCase());
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=300" },
  });
}
