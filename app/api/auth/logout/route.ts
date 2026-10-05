import { cookieHeader, endSession, readCookie, sameOrigin, SESSION_COOKIE } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { errorResponse, jsonWithCookies, wrongOrigin } from "../../../../lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    await endSession(await getDb(), readCookie(request, SESSION_COOKIE));
    return jsonWithCookies({ signedOut: true }, 200, [cookieHeader(request, SESSION_COOKIE, "", 0)]);
  } catch (error) { return errorResponse(error); }
}
