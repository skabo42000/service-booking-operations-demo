import { cookieHeader, googleConfig, googleStart, OAUTH_COOKIE, safeNext } from "../../../../../lib/auth";
import { redirectWithCookies } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const config = googleConfig();
  if (!config) return redirectWithCookies("/moji-termini?greska=google", []);
  const next = safeNext(url.searchParams.get("next"));
  const start = googleStart(config, url.origin);
  // state + PKCE verifier + where to return, readable only by the callback route for 10 minutes.
  return redirectWithCookies(start.url, [cookieHeader(request, OAUTH_COOKIE, `${start.cookie}.${encodeURIComponent(next)}`, 600, "/api/auth/google")]);
}
