import { blockTime } from "../../../../lib/booking";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    return noStore(await blockTime(db, {
      staffId: String(body.staffId ?? ""), date: String(body.date ?? ""), start: String(body.start ?? ""),
      end: String(body.end ?? ""), note: String(body.note ?? ""),
    }), 201);
  } catch (error) { return errorResponse(error); }
}
