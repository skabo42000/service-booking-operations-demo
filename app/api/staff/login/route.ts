import { cookieHeader, sameOrigin } from "../../../../lib/auth";
import { getDb } from "../../../../lib/db";
import { errorResponse, jsonWithCookies, noStore, wrongOrigin } from "../../../../lib/http";
import { allowRequest, clientKey } from "../../../../lib/protection";
import { demoKeyMatches, getStaffUser, listStaffLogins, STAFF_COOKIE, STAFF_SESSION_SECONDS, startStaffSession } from "../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Names and roles for the demo sign-in picker; no emails or other details.
export async function GET() {
  try { return noStore({ users: await listStaffLogins(await getDb()) }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return noStore({ error: "Podaci nisu ispravni." }, 400); }
  try {
    const db = await getDb();
    if (!await allowRequest(db, `staff-login:${clientKey(request)}`, 10, 900)) return noStore({ error: "Previše pokušaja prijave. Pokušajte ponovo za 15 minuta." }, 429);
    if (!demoKeyMatches(String(body.key ?? ""))) return noStore({ error: "Lozinka nije ispravna." }, 401);
    const token = await startStaffSession(db, String(body.userId ?? ""));
    // SameSite=Strict: the staff cookie is never sent when another site links or posts to this one.
    const cookie = cookieHeader(request, STAFF_COOKIE, token, STAFF_SESSION_SECONDS).replace("SameSite=Lax", "SameSite=Strict");
    return jsonWithCookies({ user: await getStaffUser(db, token) }, 200, [cookie]);
  } catch (error) { return errorResponse(error); }
}
