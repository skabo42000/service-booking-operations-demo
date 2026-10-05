import { cookieHeader, googleConfig, googleFinish, OAUTH_COOKIE, readCookie, safeNext, sessionCookie } from "../../../../../lib/auth";
import { getDb } from "../../../../../lib/db";
import { redirectWithCookies } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = googleConfig();
  const stored = readCookie(request, OAUTH_COOKIE);
  const clearOauth = cookieHeader(request, OAUTH_COOKIE, "", 0, "/api/auth/google");
  const next = safeNext(decodeURIComponent(stored.split(".")[2] ?? ""));
  if (!config || url.searchParams.has("error") || !url.searchParams.get("code")) return redirectWithCookies("/moji-termini?greska=google", [clearOauth]);
  try {
    const token = await googleFinish(await getDb(), {
      code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "", cookie: stored, origin: url.origin, config,
    });
    return redirectWithCookies(next, [clearOauth, sessionCookie(request, token)]);
  } catch (error) {
    console.error("Google prijava", error instanceof Error ? error.message : error);
    return redirectWithCookies("/moji-termini?greska=google", [clearOauth]);
  }
}
