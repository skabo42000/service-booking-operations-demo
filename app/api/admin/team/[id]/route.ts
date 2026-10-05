import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";
import { saveTeamMember } from "../../../../../lib/staff";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    return noStore(await saveTeamMember(db, {
      id: (await context.params).id, name: String(body.name ?? ""), bio: String(body.bio ?? ""), email: String(body.email ?? ""),
      serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [], active: body.active !== false,
    }));
  } catch (error) { return errorResponse(error); }
}
