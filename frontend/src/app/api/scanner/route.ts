import { NextResponse } from "next/server";
import { runScan } from "@/lib/scanner/engine";
import { cacheGet, cacheSet, TTL } from "@/lib/cache";
import type { ScanResult } from "@/lib/types";

export const maxDuration = 120;

export async function GET() {
  const cacheKey = "scanner:results";
  const cached = cacheGet<ScanResult[]>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  }

  const results = await runScan();
  cacheSet(cacheKey, results, TTL.SCANNER);

  return NextResponse.json(results, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
  });
}
