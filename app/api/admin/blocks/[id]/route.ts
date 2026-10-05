import { removeBlock } from "../../../../../lib/booking";
import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore({ removed: await removeBlock(db, (await context.params).id) });
  } catch (error) { return errorResponse(error); }
}
