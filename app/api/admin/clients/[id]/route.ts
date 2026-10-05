import { anonymizeClient, getClient, updateClient } from "../../../../../lib/clients";
import { getDb } from "../../../../../lib/db";
import { errorResponse, noStore, requireStaff } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore({ client: await getClient(db, (await context.params).id) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const body = await request.json() as Record<string, unknown>;
    await updateClient(db, (await context.params).id, {
      name: String(body.name ?? ""), phone: String(body.phone ?? ""), notes: String(body.notes ?? ""), blocked: body.blocked === true,
    });
    return noStore({ updated: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    return noStore(await anonymizeClient(db, (await context.params).id));
  } catch (error) { return errorResponse(error); }
}
