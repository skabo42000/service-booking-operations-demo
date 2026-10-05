import { setShift } from "../../../../lib/booking";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    await setShift(db, {
      staffId: String(body.staffId ?? ""), weekday: Number(body.weekday),
      start: body.start === null ? null : String(body.start ?? ""),
      end: body.end === null ? null : String(body.end ?? ""),
    });
    return noStore({ updated: true });
  } catch (error) { return errorResponse(error); }
}
