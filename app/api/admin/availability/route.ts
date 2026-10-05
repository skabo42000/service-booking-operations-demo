import { getAdminAvailability } from "../../../../lib/booking";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";
import { assertOwnBooking, canUseStaffColumn } from "../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const read = (name: string) => url.searchParams.get(name) ?? "";
    if (!canUseStaffColumn(user, read("staffId"))) return noStore({ error: "Možete vidjeti samo svoj raspored." }, 403);
    if (read("ignore")) await assertOwnBooking(db, user, read("ignore"));
    return noStore({ slots: await getAdminAvailability(db, read("serviceId"), read("staffId"), read("date"), read("ignore")) });
  } catch (error) { return errorResponse(error); }
}
