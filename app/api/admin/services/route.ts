import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";
import { getServices, saveService } from "../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore({ services: await getServices(db) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    return noStore(await saveService(db, {
      category: String(body.category ?? ""), name: String(body.name ?? ""), durationMinutes: Number(body.durationMinutes),
      price: String(body.price ?? ""), active: body.active !== false,
    }), 201);
  } catch (error) { return errorResponse(error); }
}
