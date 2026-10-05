import { emailKey, normalizeEmail, sameOrigin, startEmailLogin } from "../../../../../lib/auth.ts";
import { getDb } from "../../../../../lib/db.ts";
import { errorResponse, noStore, wrongOrigin } from "../../../../../lib/http.ts";
import { allowRequest, clientKey, verifyHuman } from "../../../../../lib/protection.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  // No email delivery exists in this reference. Displayed codes require an explicit
  // synthetic-demo opt-in and must never protect real customer records.
  if (process.env.DEMO_SHOW_LOGIN_CODE !== "on") {
    return noStore({ error: "Email prijava nije dostupna u ovoj konfiguraciji demo aplikacije." }, 503);
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return noStore({ error: "Podaci nisu ispravni." }, 400); }
  try {
    const db = await getDb();
    if (!await allowRequest(db, `login-ip:${clientKey(request)}`, 10, 900)) return noStore({ error: "Previše zahtjeva za kod. Pokušajte ponovo za 15 minuta." }, 429);
    const human = await verifyHuman(body.turnstileToken);
    if (!human.ok) return noStore({ error: human.error }, human.status);
    const email = normalizeEmail(String(body.email ?? ""));
    if (!await allowRequest(db, `login-email:${emailKey(email)}`, 3, 900)) return noStore({ error: "Za ovu adresu je već zatraženo nekoliko kodova. Pokušajte ponovo za 15 minuta." }, 429);
    const login = await startEmailLogin(db, email);
    return noStore({ challengeId: login.challengeId, email: login.email, demoCode: login.code });
  } catch (error) { return errorResponse(error); }
}
