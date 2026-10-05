import { updateStaff } from "../../../../../lib/booking";
import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";
import { canUseStaffColumn } from "../../../../../lib/staff";

export const runtime = "nodejs";

// A team member may edit her own public profile; the owner may edit every profile.
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const id = (await context.params).id;
    if (!canUseStaffColumn(user, id)) return noStore({ error: "Možete mijenjati samo svoj profil." }, 403);
    const body = await request.json() as Record<string, unknown>;
    await updateStaff(db, { id, name: String(body.name ?? ""), bio: String(body.bio ?? "") });
    return noStore({ updated: true });
  } catch (error) { return errorResponse(error); }
}
