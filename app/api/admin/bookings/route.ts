import { createAdminBookingForClient } from "../../../../lib/clients";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";
import { canUseStaffColumn } from "../../../../lib/staff";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    const staffId = String(body.staffId ?? "");
    if (!canUseStaffColumn(user, staffId)) return noStore({ error: "Termin možete upisati samo sebi." }, 403);
    const booking = await createAdminBookingForClient(db, {
      serviceId: String(body.serviceId ?? ""), staffId, date: String(body.date ?? ""), time: String(body.time ?? ""),
      clientName: String(body.clientName ?? ""), clientPhone: String(body.clientPhone ?? ""), source: String(body.source ?? ""), note: String(body.note ?? ""),
    });
    return noStore({ booking }, 201);
  } catch (error) { return errorResponse(error); }
}
