import { getDb } from "../../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../../lib/http";
import { reversePayment } from "../../../../../../lib/payments";

export const runtime = "nodejs";

// Storno is a correction of the books, so only the owner may do it.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore({ payment: await reversePayment(db, (await context.params).id) }, 201);
  } catch (error) { return errorResponse(error); }
}
