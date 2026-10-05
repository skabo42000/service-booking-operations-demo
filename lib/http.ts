import type { Client } from "@libsql/client";
import { getAccount, readCookie, sameOrigin, SESSION_COOKIE, type Account } from "./auth.ts";
import { BookingError } from "./booking.ts";
import { getStaffUser, STAFF_COOKIE, type StaffUser } from "./staff.ts";

export function errorResponse(error: unknown): Response {
  if (error instanceof BookingError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Greška demo rezervacija", error);
  return Response.json({ error: "Došlo je do greške. Pokušajte ponovo." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

// Every admin route calls this: a valid staff session, the right role, and for changes a same-site Origin.
export async function requireStaff(request: Request, db: Client, ownerOnly = false): Promise<StaffUser | Response> {
  if (request.method !== "GET" && !sameOrigin(request)) return wrongOrigin();
  const user = await getStaffUser(db, readCookie(request, STAFF_COOKIE));
  if (!user) return noStore({ error: "Prijavite se kao osoblje." }, 401);
  if (ownerOnly && user.role !== "owner") return noStore({ error: "Samo vlasnica ima pristup ovom dijelu." }, 403);
  return user;
}

export function noStore(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonWithCookies(data: unknown, status: number, cookies: string[]): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json(data, { status, headers });
}

export function redirectWithCookies(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function signedInAccount(request: Request, db: Client): Promise<Account | null> {
  return getAccount(db, readCookie(request, SESSION_COOKIE));
}

export function notSignedIn(): Response {
  return noStore({ error: "Prijavite se da nastavite." }, 401);
}

export function wrongOrigin(): Response {
  return noStore({ error: "Zahtjev nije dozvoljen." }, 403);
}
