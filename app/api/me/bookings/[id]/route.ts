import { cancelMyBooking, sameOrigin } from "../../../../../lib/auth";
import { rescheduleBooking } from "../../../../../lib/booking";
import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, notSignedIn, signedInAccount, wrongOrigin } from "../../../../../lib/http";
import { allowRequest, clientKey } from "../../../../../lib/protection";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

async function prepare(request: Request) {
  const db = await getDb();
  const account = await signedInAccount(request, db);
  const allowed = await allowRequest(db, `account:${clientKey(request)}`, 60, 3600);
  return { db, account, allowed };
}

export async function DELETE(request: Request, context: Context) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    const { db, account, allowed } = await prepare(request);
    if (!account) return notSignedIn();
    if (!allowed) return noStore({ error: "Previše izmjena. Pokušajte ponovo kasnije." }, 429);
    await cancelMyBooking(db, account.id, (await context.params).id);
    return noStore({ cancelled: true });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  if (!sameOrigin(request)) return wrongOrigin();
  try {
    const { db, account, allowed } = await prepare(request);
    if (!account) return notSignedIn();
    if (!allowed) return noStore({ error: "Previše izmjena. Pokušajte ponovo kasnije." }, 429);
    if (account.blocked) return noStore({ error: "Online izmjene nisu dostupne za ovaj nalog. Pozovite salon." }, 403);
    const body = await request.json() as Record<string, unknown>;
    const booking = await rescheduleBooking(db, (await context.params).id, { staffId: String(body.staffId ?? ""), date: String(body.date ?? ""), time: String(body.time ?? "") }, new Date(), account.id);
    return noStore({ booking });
  } catch (error) { return errorResponse(error); }
}
