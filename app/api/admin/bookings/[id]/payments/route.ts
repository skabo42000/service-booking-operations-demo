import { getDb } from "../../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../../lib/http";
import { recordPayment } from "../../../../../../lib/payments";
import { assertOwnBooking } from "../../../../../../lib/staff";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db);
    if (user instanceof Response) return user;
    const id = (await context.params).id;
    await assertOwnBooking(db, user, id);
    const body = await request.json() as Record<string, unknown>;
    const payment = await recordPayment(db, id, {
      requestId: String(body.requestId ?? ""), amount: String(body.amount ?? ""), method: String(body.method ?? ""), receiptNumber: String(body.receiptNumber ?? ""),
    });
    return noStore({ payment }, 201);
  } catch (error) { return errorResponse(error); }
}
