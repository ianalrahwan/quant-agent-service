import crypto from "node:crypto";

export const COOKIE_NAME = "agent_pro";

export function isValidProCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret) return false;
  const [random, sig] = cookieValue.split(".");
  if (!random || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(random).digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
