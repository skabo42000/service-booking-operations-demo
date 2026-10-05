import { sameOrigin } from "../../../lib/auth";
import { createBooking } from "../../../lib/booking";
import { getDb } from "../../../lib/db";
import { errorResponse, noStore, notSignedIn, signedInAccount, wrongOrigin } from "../../../lib/http";
import { allowRequest, clientKey } from "../../../lib/protection";

export const runtime = "nodejs";

const PER_VISITOR_HOURLY = 10;
const DEMO_DAILY_TOTAL = 300;

// Online booking needs a signed-in account; the bot check happens when the login code is requested.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return wrongOrigin();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return noStore({ error: "Podaci nisu ispravni." }, 400); }
  try {
    const db = await getDb();
    const account = await signedInAccount(request, db);
    if (!account) return notSignedIn();
    if (account.blocked) return noStore({ error: "Online zakazivanje nije dostupno za ovaj nalog. Pozovite salon." }, 403);
    if (!account.name) return noStore({ error: "Prvo upišite ime u profilu." }, 400);
    if (!await allowRequest(db, `booking:${clientKey(request)}`, PER_VISITOR_HOURLY, 3600))
      return noStore({ error: "Previše pokušaja zakazivanja. Pokušajte ponovo za sat vremena." }, 429);
    if (!await allowRequest(db, "booking:all", DEMO_DAILY_TOTAL, 86_400))
      return noStore({ error: "Demo kalendar je za danas popunjen. Pokušajte sutra." }, 429);
    const booking = await createBooking(db, {
      serviceId: String(body.serviceId ?? ""), staffId: String(body.staffId ?? ""), date: String(body.date ?? ""),
      time: String(body.time ?? ""), clientName: account.name, clientPhone: account.phone, clientId: account.id,
    });
    return noStore({ booking }, 201);
  } catch (error) { return errorResponse(error); }
}
