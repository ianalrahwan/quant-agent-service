import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { COOKIE_NAME } from "@/lib/pro-cookie";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.AGENT_ACCESS_PASSWORD;
  const cookieSecret = process.env.SESSION_COOKIE_SECRET;

  if (!expected || !cookieSecret) {
    return NextResponse.json({ ok: false, reason: "server-not-configured" }, { status: 500 });
  }
  // Tiny delay to mute timing oracles
  await new Promise((r) => setTimeout(r, 150));

  if (!password || !timingSafeEqualStr(password, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const random = crypto.randomBytes(16).toString("hex");
  const token = `${random}.${sign(random, cookieSecret)}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
