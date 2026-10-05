import { getDb } from "../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../lib/http";
import { getTeam, saveTeamMember } from "../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore({ team: await getTeam(db) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    return noStore(await saveTeamMember(db, {
      name: String(body.name ?? ""), bio: String(body.bio ?? ""), email: String(body.email ?? ""),
      serviceIds: Array.isArray(body.serviceIds) ? body.serviceIds.map(String) : [], active: body.active !== false,
    }), 201);
  } catch (error) { return errorResponse(error); }
}
