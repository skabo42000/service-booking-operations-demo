import { getAccount, sameOrigin, sessionCookie, verifyEmailLogin } from "../../../../../lib/auth";
import { getDb } from "../../../../../lib/db";
import { errorResponse, jsonWithCookies, noStore, wrongOrigin } from "../../../../../lib/http";
import { allowRequest, clientKey } from "../../../../../lib/protection";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return noStore({ error: "Podaci nisu ispravni." }, 400); }
  try {
    const db = await getDb();
    if (!await allowRequest(db, `login-verify:${clientKey(request)}`, 30, 900)) return noStore({ error: "Previše pokušaja. Pokušajte ponovo za 15 minuta." }, 429);
    const token = await verifyEmailLogin(db, String(body.challengeId ?? ""), String(body.code ?? ""));
    return jsonWithCookies({ account: await getAccount(db, token) }, 200, [sessionCookie(request, token)]);
  } catch (error) { return errorResponse(error); }
}
