import { cookieHeader, readCookie, sameOrigin } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { errorResponse, jsonWithCookies, wrongOrigin } from "../../../../lib/http";
import { endStaffSession, STAFF_COOKIE } from "../../../../lib/staff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    await endStaffSession(await getDb(), readCookie(request, STAFF_COOKIE));
    return jsonWithCookies({ signedOut: true }, 200, [cookieHeader(request, STAFF_COOKIE, "", 0).replace("SameSite=Lax", "SameSite=Strict")]);
  } catch (error) { return errorResponse(error); }
}
