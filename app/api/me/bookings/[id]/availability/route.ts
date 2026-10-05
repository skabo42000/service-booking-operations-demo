import { myBookingService } from "../../../../../../lib/auth";
import { getAvailability } from "../../../../../../lib/booking";
import { getDb } from "../../../../../../lib/db";
import { errorResponse, noStore, notSignedIn, signedInAccount } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const account = await signedInAccount(request, db);
    if (!account) return notSignedIn();
    const id = (await context.params).id;
    const params = new URL(request.url).searchParams;
    const serviceId = await myBookingService(db, account.id, id);
    return noStore({ slots: await getAvailability(db, serviceId, params.get("staffId") ?? "", params.get("date") ?? "", new Date(), id) });
  } catch (error) { return errorResponse(error); }
}
