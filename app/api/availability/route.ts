import { getAvailability } from "../../../lib/booking";
import { getDb } from "../../../lib/db";
import { errorResponse, noStore } from "../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slots = await getAvailability(await getDb(), url.searchParams.get("serviceId") ?? "", url.searchParams.get("staffId") ?? "", url.searchParams.get("date") ?? "");
    return noStore({ slots });
  } catch (error) { return errorResponse(error); }
}
