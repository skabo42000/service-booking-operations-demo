import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";

export type HumanCheck = { ok: true } | { ok: false; status: number; error: string };

// Vercel overwrites x-forwarded-for, so the first address is the visitor. Only a short hash is stored.
export function clientKey(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

// Fixed-window counter shared by every server instance because it lives in the database.
export async function allowRequest(db: Client, key: string, limit: number, windowSeconds: number, now = new Date()): Promise<boolean> {
  const windowStart = Math.floor(now.getTime() / 1000 / windowSeconds) * windowSeconds;
  const result = await db.execute({
    sql: "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count",
    args: [key, windowStart],
  });
  return Number(result.rows[0].count) <= limit;
}

export async function verifyHuman(token: unknown, options: { secret?: string; required?: boolean; fetcher?: typeof fetch } = {}): Promise<HumanCheck> {
  const secret = options.secret ?? process.env.TURNSTILE_SECRET_KEY;
  // BOT_CHECK=off is an explicit, temporary switch for a deploy that has no Cloudflare keys yet; rate limits still apply.
  const required = options.required ?? ((process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) && process.env.BOT_CHECK !== "off");
  if (!secret) {
    if (!required) return { ok: true };
    console.error("TURNSTILE_SECRET_KEY nije postavljen");
    return { ok: false, status: 503, error: "Zakazivanje trenutno nije dostupno. Pokušajte kasnije." };
  }
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, status: 400, error: "Sačekajte da se završi provjera da niste robot, pa pokušajte ponovo." };
  try {
    const response = await (options.fetcher ?? fetch)("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const result = await response.json() as { success?: boolean };
    if (result.success === true) return { ok: true };
    return { ok: false, status: 400, error: "Provjera da niste robot nije uspjela. Pokušajte ponovo." };
  } catch {
    return { ok: false, status: 503, error: "Provjera trenutno nije dostupna. Pokušajte ponovo." };
  }
}
