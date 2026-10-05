import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import { normalizeEmail } from "./auth.ts";
import { BookingError, rows, sarajevoNow } from "./booking.ts";
import { parseAmount } from "./payments.ts";

export const STAFF_COOKIE = "princess_staff";
export const STAFF_SESSION_SECONDS = 12 * 3600;
export const SERVICE_CATEGORIES = ["nokti", "kosa", "depilacija"] as const;

export type Role = "owner" | "staff";
export type StaffUser = { id: string; name: string; email: string; role: Role; staffId: string | null };

const seconds = (now: Date) => Math.floor(now.getTime() / 1000);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Demo entry: the shared demo password plus the person to sign in as. Compared in constant time.
export function demoKeyMatches(supplied: string, expected = process.env.DEMO_ADMIN_KEY ?? ""): boolean {
  if (expected.length < 20 || typeof supplied !== "string" || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

const USER_COLUMNS = `u.id, COALESCE(s.name, u.name) AS name, u.email, u.role, u.staff_id
  FROM staff_users u LEFT JOIN staff s ON s.id = u.staff_id
  WHERE u.active = 1 AND (u.staff_id IS NULL OR s.active = 1)`;

function toUser(row: Record<string, string | number | null>): StaffUser {
  return { id: String(row.id), name: String(row.name), email: String(row.email), role: row.role === "owner" ? "owner" : "staff", staffId: row.staff_id ? String(row.staff_id) : null };
}

export async function listStaffLogins(db: Client) {
  const result = await db.execute(`SELECT ${USER_COLUMNS} ORDER BY u.role = 'owner' DESC, COALESCE(s.sort_order, 0), u.name`);
  return rows(result).map(toUser).map(({ id, name, role }) => ({ id, name, role }));
}

// Same idea as client sessions: the browser holds a random token, the database only its hash.
export async function startStaffSession(db: Client, userId: string, now = new Date()): Promise<string> {
  const user = rows(await db.execute({ sql: `SELECT ${USER_COLUMNS} AND u.id = ?`, args: [userId] }))[0];
  if (!user) throw new BookingError("Nalog osoblja nije pronađen ili nije aktivan.", 404);
  const token = randomBytes(32).toString("base64url");
  await db.execute({
    sql: "INSERT INTO staff_sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [randomUUID(), sha256(token), userId, seconds(now) + STAFF_SESSION_SECONDS, seconds(now)],
  });
  return token;
}

export async function getStaffUser(db: Client, token: string, now = new Date()): Promise<StaffUser | null> {
  if (!token || token.length > 100) return null;
  const row = rows(await db.execute({
    sql: `SELECT ${USER_COLUMNS} AND u.id = (SELECT user_id FROM staff_sessions WHERE token_hash = ? AND expires_at > ?)`,
    args: [sha256(token), seconds(now)],
  }))[0];
  return row ? toUser(row) : null;
}

export async function endStaffSession(db: Client, token: string) {
  if (token) await db.execute({ sql: "DELETE FROM staff_sessions WHERE token_hash = ?", args: [sha256(token)] });
}

// A team member may only touch bookings in her own column of the calendar; the owner may touch all.
export function canUseStaffColumn(user: StaffUser, staffId: string): boolean {
  return user.role === "owner" || (user.staffId !== null && user.staffId === staffId);
}

export async function assertOwnBooking(db: Client, user: StaffUser, bookingId: string) {
  if (user.role === "owner") return;
  const row = rows(await db.execute({ sql: "SELECT staff_id FROM bookings WHERE id = ?", args: [bookingId] }))[0];
  if (!row) throw new BookingError("Termin nije pronađen.", 404);
  if (!canUseStaffColumn(user, String(row.staff_id))) throw new BookingError("Ovaj termin pripada drugom članu tima.", 403);
}

// --- Team (owner only) ---

export async function getTeam(db: Client) {
  const [people, skills, users] = (await db.batch([
    "SELECT id, name, bio, active FROM staff ORDER BY active DESC, sort_order",
    "SELECT staff_id, service_id FROM staff_services",
    "SELECT id, email, staff_id FROM staff_users WHERE staff_id IS NOT NULL",
  ], "read")).map((result) => rows(result));
  return people.map((person) => ({
    id: String(person.id), name: String(person.name), bio: String(person.bio), active: Number(person.active) === 1,
    serviceIds: skills.filter((row) => row.staff_id === person.id).map((row) => String(row.service_id)),
    email: String(users.find((row) => row.staff_id === person.id)?.email ?? ""),
  }));
}

export async function saveTeamMember(db: Client, input: { id?: string; name: string; bio: string; email: string; serviceIds: string[]; active: boolean }, now = new Date()) {
  const name = String(input.name ?? "").trim(), bio = String(input.bio ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new BookingError("Ime mora imati od 2 do 60 znakova.");
  if (!bio || bio.length > 240) throw new BookingError("Opis mora imati od 1 do 240 znakova.");
  const email = String(input.email ?? "").trim() ? normalizeEmail(input.email) : "";
  const serviceIds = [...new Set((input.serviceIds ?? []).map(String))];
  const known = rows(await db.execute("SELECT id FROM services")).map((row) => String(row.id));
  if (serviceIds.some((id) => !known.includes(id))) throw new BookingError("Nepoznata usluga.");
  const today = sarajevoNow(now).date;
  const id = input.id ?? `tim-${randomUUID().slice(0, 8)}`;

  if (input.id) {
    const current = rows(await db.execute({ sql: "SELECT active FROM staff WHERE id = ?", args: [id] }))[0];
    if (!current) throw new BookingError("Član tima nije pronađen.", 404);
    // Future bookings must stay valid: no switching off a person or a service someone is already booked for.
    const future = rows(await db.execute({
      sql: "SELECT DISTINCT b.service_id, v.name FROM bookings b JOIN services v ON v.id = b.service_id WHERE b.staff_id = ? AND b.status = 'confirmed' AND b.date >= ?",
      args: [id, today],
    }));
    if (!input.active && future.length) throw new BookingError("Prvo premjestite ili otkažite buduće termine ovog člana tima.", 409);
    const dropped = future.find((row) => !serviceIds.includes(String(row.service_id)));
    if (dropped) throw new BookingError(`Za uslugu „${dropped.name}“ postoje budući termini. Prvo ih premjestite.`, 409);
  }

  const statements: InStatement[] = input.id
    ? [
      { sql: "UPDATE staff SET name = ?, bio = ?, active = ? WHERE id = ?", args: [name, bio, input.active ? 1 : 0, id] },
      { sql: "UPDATE staff_users SET name = ?, email = ?, active = ? WHERE staff_id = ?", args: [name, email, input.active ? 1 : 0, id] },
      { sql: "DELETE FROM staff_services WHERE staff_id = ?", args: [id] },
    ]
    : [
      { sql: "INSERT INTO staff (id, name, bio, active, sort_order) SELECT ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM staff", args: [id, name, bio, input.active ? 1 : 0] },
      { sql: "INSERT INTO staff_users (id, name, email, role, staff_id, active, created_at) VALUES (?, ?, ?, 'staff', ?, ?, ?)", args: [`osoblje-${id}`, name, email, id, input.active ? 1 : 0, now.toISOString()] },
    ];
  statements.push(...serviceIds.map((serviceId) => ({ sql: "INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)", args: [id, serviceId] })));
  if (!input.active) statements.push({ sql: "DELETE FROM staff_sessions WHERE user_id IN (SELECT id FROM staff_users WHERE staff_id = ?)", args: [id] });
  try { await db.batch(statements, "write"); }
  catch (error) {
    if (String(error).includes("UNIQUE")) throw new BookingError("Ta email adresa već pripada drugom članu osoblja.", 409);
    throw error;
  }
  return { id };
}

// --- Services (owner only) ---

export async function getServices(db: Client) {
  const result = await db.execute("SELECT id, category, name, duration_min, price_fening, active FROM services ORDER BY active DESC, sort_order");
  return rows(result).map((row) => ({
    id: String(row.id), category: String(row.category), name: String(row.name), durationMinutes: Number(row.duration_min),
    priceFening: row.price_fening === null ? null : Number(row.price_fening), active: Number(row.active) === 1,
  }));
}

export async function saveService(db: Client, input: { id?: string; category: string; name: string; durationMinutes: number; price: string; active: boolean }) {
  if (!(SERVICE_CATEGORIES as readonly string[]).includes(input.category)) throw new BookingError("Odaberite kategoriju: nokti, kosa ili depilacija.");
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 60) throw new BookingError("Naziv mora imati od 2 do 60 znakova.");
  const duration = Number(input.durationMinutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 480 || duration % 15 !== 0) throw new BookingError("Trajanje mora biti od 15 do 480 minuta, u koracima od 15.");
  // An empty price is stored as NULL: "not confirmed yet" is different from "free".
  const price = String(input.price ?? "").trim() ? parseAmount(input.price) : null;
  if (input.id) {
    const updated = await db.execute({
      sql: "UPDATE services SET category = ?, name = ?, duration_min = ?, price_fening = ?, active = ? WHERE id = ?",
      args: [input.category, name, duration, price, input.active ? 1 : 0, input.id],
    });
    if (updated.rowsAffected === 0) throw new BookingError("Usluga nije pronađena.", 404);
    return { id: input.id };
  }
  const id = `usluga-${randomUUID().slice(0, 8)}`;
  await db.execute({
    sql: "INSERT INTO services (id, category, name, duration_min, price_fening, active, sort_order) SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM services",
    args: [id, input.category, name, duration, price, input.active ? 1 : 0],
  });
  return { id };
}
