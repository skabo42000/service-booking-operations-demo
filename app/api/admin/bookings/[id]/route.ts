import { cancelBooking, rescheduleBooking, setBookingStatus } from "../../../../../lib/booking";
import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";
import { assertOwnBooking, canUseStaffColumn } from "../../../../../lib/staff";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const id = (await context.params).id;
    await assertOwnBooking(db, user, id);
    const body = await request.json() as Record<string, unknown>;
    if (body.status !== undefined) {
      await setBookingStatus(db, id, String(body.status));
      return noStore({ updated: true });
    }
    const staffId = String(body.staffId ?? "");
    if (!canUseStaffColumn(user, staffId)) return noStore({ error: "Termin kod drugog člana tima može premjestiti samo vlasnica." }, 403);
    return noStore({ booking: await rescheduleBooking(db, id, { staffId, date: String(body.date ?? ""), time: String(body.time ?? "") }) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const id = (await context.params).id;
    await assertOwnBooking(db, user, id);
    return noStore({ cancelled: await cancelBooking(db, id) });
  } catch (error) { return errorResponse(error); }
}
