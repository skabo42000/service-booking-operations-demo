import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";
import { dailyReport } from "../../../../../lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore(await dailyReport(db, new URL(request.url).searchParams.get("date") ?? ""));
  } catch (error) { return errorResponse(error); }
}
