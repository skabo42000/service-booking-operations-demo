import { cookieHeader, getMyBookings, sameOrigin, SESSION_COOKIE, updateProfile } from "../../../lib/auth";
import { anonymizeClient } from "../../../lib/clients";
import { getDb } from "../../../lib/db";
import { errorResponse, jsonWithCookies, noStore, notSignedIn, signedInAccount, wrongOrigin } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const account = await signedInAccount(request, db);
    if (!account) return notSignedIn();
    return noStore({ account, bookings: await getMyBookings(db, account.id) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    const db = await getDb();
    const account = await signedInAccount(request, db);
    if (!account) return notSignedIn();
    const body = await request.json() as Record<string, unknown>;
    await updateProfile(db, account.id, { name: String(body.name ?? ""), phone: String(body.phone ?? "") });
    return noStore({ account: await signedInAccount(request, db) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    const db = await getDb();
    const account = await signedInAccount(request, db);
    if (!account) return notSignedIn();
    const result = await anonymizeClient(db, account.id);
    return jsonWithCookies({ deleted: true, ...result }, 200, [cookieHeader(request, SESSION_COOKIE, "", 0)]);
  } catch (error) { return errorResponse(error); }
}
