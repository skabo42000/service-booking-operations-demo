import { getCatalog } from "../../../lib/booking";
import { getDb } from "../../../lib/db";
import { errorResponse, noStore } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return noStore(await getCatalog(await getDb())); }
  catch (error) { return errorResponse(error); }
}
