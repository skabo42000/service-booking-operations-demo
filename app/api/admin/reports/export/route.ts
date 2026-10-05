import { getDb } from "../../../../../lib/db";
import { errorResponse, requireStaff } from "../../../../../lib/http";
import { paymentsCsv } from "../../../../../lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await requireStaff(request, db, true);
    if (user instanceof Response) return user;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
    return new Response(await paymentsCsv(db, from, to), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="princess-naplata-${from}-${to}.csv"`,
      },
    });
  } catch (error) { return errorResponse(error); }
}
