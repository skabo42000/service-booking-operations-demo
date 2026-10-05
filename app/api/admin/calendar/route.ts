import { getDayBlocks, getDayBookings } from "../../../../lib/booking";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";
import { getPaymentsForBookings } from "../../../../lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const date = new URL(request.url).searchParams.get("date") ?? "";
    // A team member only receives her own column; filtering happens here, not in the browser.
    const mine = <T extends { staffId: unknown }>(items: T[]) => user.role === "owner" ? items : items.filter((item) => item.staffId === user.staffId);
    const bookings = mine(await getDayBookings(db, date));
    const payments = await getPaymentsForBookings(db, bookings.map((booking) => String(booking.id)));
    return noStore({ bookings: bookings.map((booking) => ({ ...booking, payments: payments[String(booking.id)] ?? [] })), blocks: mine(await getDayBlocks(db, date)) });
  } catch (error) { return errorResponse(error); }
}
