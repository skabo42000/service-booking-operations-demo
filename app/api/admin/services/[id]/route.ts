import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";
import { saveService } from "../../../../../lib/staff";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    return noStore(await saveService(db, {
      id: (await context.params).id, category: String(body.category ?? ""), name: String(body.name ?? ""),
      durationMinutes: Number(body.durationMinutes), price: String(body.price ?? ""), active: body.active !== false,
    }));
  } catch (error) { return errorResponse(error); }
}
