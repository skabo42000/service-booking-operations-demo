import { findClientByPhone, searchClients } from "../../../../lib/clients";
import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recognising a caller by phone helps everyone who enters bookings; browsing the whole client list is for the owner.
export async function GET(request: Request) {
  try {
    const db = await getDb();
    const params = new URL(request.url).searchParams;
    const user = await requireStaff(request, db, !params.has("phone"));
    if (user instanceof Response) return user;
    if (params.has("phone")) return noStore({ client: await findClientByPhone(db, params.get("phone") ?? "") });
    return noStore({ clients: await searchClients(db, params.get("q") ?? "") });
  } catch (error) { return errorResponse(error); }
}
