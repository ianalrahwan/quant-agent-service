import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/pro-cookie";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
