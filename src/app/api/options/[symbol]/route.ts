import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getOptionsChain } from "@/lib/yahoo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const data = await getOptionsChain(symbol.toUpperCase());
  if (!data) {
    return NextResponse.json({ error: "Options data not found" }, { status: 404 });
  }
  return NextResponse.json(data, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
