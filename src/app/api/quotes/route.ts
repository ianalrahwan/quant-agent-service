import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({}, { status: 400 });
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const quotes = await getQuotes(symbols);

  const result: Record<string, { price: number; change: number; changePct: number; name: string }> = {};
  for (const [sym, q] of quotes) {
    result[sym] = {
      price: q.price,
      change: q.change,
      changePct: q.changePct,
      name: q.name,
    };
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
  });
}
