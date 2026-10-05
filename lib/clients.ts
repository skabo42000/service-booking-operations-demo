import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { BookingError, clock, createAdminBooking, rows, sarajevoNow, type NewBooking } from "./booking.ts";

export const DELETED_NAME = "Obrisan klijent";

// "065 123 456", "+387 65 123-456" and "0038765123456" are one person: compare phones by their international digits.
export function phoneKey(phone: string): string {
  const trimmed = String(phone ?? "").trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `387${digits.slice(1)}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

// Lowercase without diacritics, so "sejla" finds "Šejla" and "djurdja" finds "Đurđa".
export function searchName(name: string): string {
  return name.toLocaleLowerCase("sr-Latn").replaceAll("đ", "dj").normalize("NFD").replace(/\p{Mn}/gu, "").trim();
}

function validName(name: string): string {
  const clean = String(name ?? "").trim();
  if (clean.length < 2 || clean.length > 80) throw new BookingError("Ime mora imati od 2 do 80 znakova.");
  return clean;
}

// Find-or-create in one statement: the unique index decides, so two parallel requests still produce one client.
async function upsertClient(db: Client, field: "phone_key" | "email", value: string, name: string, phone: string, now: Date): Promise<string> {
  await db.execute({
    sql: `INSERT INTO clients (id, name, search_name, phone, phone_key, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(${field}) WHERE ${field} <> '' DO NOTHING`,
    args: [randomUUID(), name, searchName(name), phone, field === "phone_key" ? value : phoneKey(phone), field === "email" ? value : "", now.toISOString()],
  });
  return String((await db.execute({ sql: `SELECT id FROM clients WHERE ${field} = ?`, args: [value] })).rows[0].id);
}

export async function findOrCreateClientByPhone(db: Client, name: string, phone: string, now = new Date()): Promise<string | null> {
  const key = phoneKey(phone);
  if (!key) return null;
  return upsertClient(db, "phone_key", key, validName(name), phone.trim(), now);
}

export async function findOrCreateClientByEmail(db: Client, email: string, name = "", now = new Date()): Promise<string> {
  const id = await upsertClient(db, "email", email, name.trim(), "", now);
  if (name.trim()) await db.execute({ sql: "UPDATE clients SET name = ?, search_name = ? WHERE id = ? AND name = ''", args: [name.trim(), searchName(name), id] });
  return id;
}

export async function createAdminBookingForClient(db: Client, input: NewBooking, now = new Date()) {
  const clientId = input.clientPhone?.trim() ? await findOrCreateClientByPhone(db, input.clientName, input.clientPhone, now) : null;
  return createAdminBooking(db, { ...input, clientId }, now);
}

const STATS = `
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id AND b.status = 'arrived') AS visits,
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id AND b.status = 'no_show') AS no_shows,
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id AND b.status = 'cancelled') AS cancellations,
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id = c.id AND b.status = 'confirmed' AND b.date >= ?) AS upcoming,
  (SELECT MAX(b.date) FROM bookings b WHERE b.client_id = c.id AND b.status = 'arrived') AS last_visit,
  (SELECT COALESCE(SUM(p.amount_fening), 0) FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.client_id = c.id) AS total_paid`;

function toClient(row: Record<string, string | number | null>) {
  return {
    id: String(row.id), name: String(row.name), phone: String(row.phone), email: String(row.email), notes: String(row.notes),
    blocked: Number(row.blocked) === 1, visits: Number(row.visits), noShows: Number(row.no_shows), cancellations: Number(row.cancellations),
    upcoming: Number(row.upcoming), lastVisit: row.last_visit ? String(row.last_visit) : null, totalPaid: Number(row.total_paid),
  };
}

export async function searchClients(db: Client, query: string, now = new Date()) {
  const text = searchName(String(query ?? "").slice(0, 60));
  const digits = text.replace(/\D/g, "");
  const conditions = ["c.search_name LIKE ?", "c.email LIKE ?"];
  const args: string[] = [sarajevoNow(now).date, `%${text}%`, `%${text}%`];
  if (digits.length >= 3) { conditions.push("c.phone_key LIKE ?"); args.push(`%${digits.replace(/^0+/, "")}%`); }
  const result = await db.execute({
    sql: `SELECT c.*, ${STATS} FROM clients c WHERE c.deleted_at = '' AND (${conditions.join(" OR ")}) ORDER BY c.search_name LIMIT 50`,
    args,
  });
  return rows(result).map(toClient);
}

export async function findClientByPhone(db: Client, phone: string, now = new Date()) {
  const key = phoneKey(phone);
  if (!key) return null;
  const row = rows(await db.execute({ sql: `SELECT c.*, ${STATS} FROM clients c WHERE c.phone_key = ? AND c.deleted_at = ''`, args: [sarajevoNow(now).date, key] }))[0];
  return row ? toClient(row) : null;
}

export async function getClient(db: Client, id: string, now = new Date()) {
  const row = rows(await db.execute({ sql: `SELECT c.*, ${STATS} FROM clients c WHERE c.id = ?`, args: [sarajevoNow(now).date, id] }))[0];
  if (!row) throw new BookingError("Klijent nije pronađen.", 404);
  const history = await db.execute({
    sql: `SELECT b.id, b.date, b.start_min, b.status, b.source, v.name AS service_name, s.name AS staff_name,
      COALESCE((SELECT SUM(amount_fening) FROM payments WHERE booking_id = b.id), 0) AS paid
      FROM bookings b JOIN services v ON v.id = b.service_id JOIN staff s ON s.id = b.staff_id
      WHERE b.client_id = ? ORDER BY b.date DESC, b.start_min DESC LIMIT 100`,
    args: [id],
  });
  return {
    ...toClient(row),
    deleted: String(row.deleted_at) !== "",
    history: rows(history).map((item) => ({
      id: String(item.id), date: String(item.date), time: clock(Number(item.start_min)), status: String(item.status), source: String(item.source),
      serviceName: String(item.service_name), staffName: String(item.staff_name), paid: Number(item.paid),
    })),
  };
}

export async function updateClient(db: Client, id: string, input: { name: string; phone: string; notes: string; blocked: boolean }, now = new Date()) {
  const name = validName(input.name);
  const phone = String(input.phone ?? "").trim();
  const key = phoneKey(phone);
  if (phone && !key) throw new BookingError("Telefon nije ispravan. Primjer: 065 123 456.");
  const notes = String(input.notes ?? "").trim();
  if (notes.length > 500) throw new BookingError("Napomena može imati najviše 500 znakova.");
  try {
    const updated = await db.execute({
      sql: "UPDATE clients SET name = ?, search_name = ?, phone = ?, phone_key = ?, notes = ?, blocked = ?, updated_at = ? WHERE id = ? AND deleted_at = ''",
      args: [name, searchName(name), phone, key, notes, input.blocked ? 1 : 0, now.toISOString(), id],
    });
    if (updated.rowsAffected === 0) throw new BookingError("Klijent nije pronađen.", 404);
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new BookingError("Taj broj telefona već ima drugi klijent.", 409);
    throw error;
  }
}

// Right to erasure without breaking the books: personal data goes, visits and payments stay as anonymous records.
export async function anonymizeClient(db: Client, id: string, now = new Date()) {
  const results = await db.batch([
    { sql: "UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE client_id = ? AND status = 'confirmed' AND date >= ?", args: [now.toISOString(), id, sarajevoNow(now).date] },
    { sql: "UPDATE bookings SET client_name = ?, client_phone = '', note = '' WHERE client_id = ?", args: [DELETED_NAME, id] },
    { sql: "DELETE FROM sessions WHERE client_id = ?", args: [id] },
    { sql: "UPDATE clients SET name = ?, search_name = ?, phone = '', phone_key = '', email = '', notes = '', blocked = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at = ''",
      args: [DELETED_NAME, searchName(DELETED_NAME), now.toISOString(), now.toISOString(), id] },
  ], "write");
  if (results[3].rowsAffected === 0) throw new BookingError("Klijent nije pronađen.", 404);
  return { cancelledBookings: results[0].rowsAffected };
}
