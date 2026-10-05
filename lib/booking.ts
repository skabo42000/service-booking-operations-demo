import { randomUUID } from "node:crypto";
import type { Client, ResultSet } from "@libsql/client";

export const TIME_ZONE = "Europe/Sarajevo";
export const DEMO_DAYS_AHEAD = 21;
export const ADMIN_DAYS_AHEAD = 90;
export const ADMIN_SOURCES = ["phone", "message", "walk_in"] as const;
export const VISIT_STATUSES = ["confirmed", "arrived", "no_show"] as const;

export type Service = { id: string; category: string; name: string; durationMinutes: number; priceFening: number | null };
export type Shift = { weekday: number; start: string; end: string };
export type Staff = { id: string; name: string; bio: string; serviceIds: string[]; shifts: Shift[] };
export type Booking = { id: string; serviceId: string; staffId: string; date: string; time: string; endTime: string; clientName: string; status: string };

type Row = Record<string, string | number | null>;
type PlanOptions = { daysAhead: number; includeEarlierToday: boolean; ignoreBookingId?: string };

const PUBLIC_PLAN: PlanOptions = { daysAhead: DEMO_DAYS_AHEAD, includeEarlierToday: false };
const ADMIN_PLAN: PlanOptions = { daysAhead: ADMIN_DAYS_AHEAD, includeEarlierToday: true };
// Arrived visits keep their time; no-shows and cancellations free it.
const OCCUPYING = "('confirmed', 'arrived')";
const UPCOMING_COUNT = "(SELECT COUNT(*) FROM bookings WHERE client_id = ? AND status = 'confirmed' AND date >= ?)";
const SLOT_FREE = `EXISTS (SELECT 1 FROM shifts WHERE staff_id = ? AND weekday = ? AND start_min <= ? AND end_min >= ?)
  AND NOT EXISTS (SELECT 1 FROM bookings WHERE staff_id = ? AND date = ? AND status IN ${OCCUPYING} AND start_min < ? AND end_min > ? AND id <> ?)
  AND NOT EXISTS (SELECT 1 FROM time_off WHERE staff_id = ? AND date = ? AND start_min < ? AND end_min > ?)`;

export class BookingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function rows<T = Row>(result: ResultSet): T[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])) as T);
}

export function minutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BookingError("Vrijeme nije ispravno.");
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function sarajevoNow(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const item = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${item("year")}-${item("month")}-${item("day")}`, time: `${item("hour")}:${item("minute")}` };
}

export function bookingWindow(date: string, now = new Date(), daysAhead = DEMO_DAYS_AHEAD): boolean {
  if (!validDate(date)) return false;
  const today = sarajevoNow(now).date;
  const difference = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000;
  return difference >= 0 && difference <= daysAhead;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function slotFreeArgs(staffId: string, date: string, start: number, end: number, ignoreBookingId = "") {
  return [staffId, weekdayOf(date), start, end, staffId, date, end, start, ignoreBookingId, staffId, date, end, start];
}

export async function getCatalog(db: Client): Promise<{ services: Service[]; staff: Staff[] }> {
  const [serviceRows, staffRows, skillRows, shiftRows] = (await db.batch([
    "SELECT id, category, name, duration_min AS durationMinutes, price_fening AS priceFening FROM services WHERE active = 1 ORDER BY sort_order",
    "SELECT id, name, bio FROM staff WHERE active = 1 ORDER BY sort_order",
    "SELECT staff_id, service_id FROM staff_services",
    "SELECT staff_id, weekday, start_min, end_min FROM shifts ORDER BY weekday",
  ], "read")).map((result) => rows(result));
  const staff = staffRows.map((person) => ({
    id: String(person.id), name: String(person.name), bio: String(person.bio),
    serviceIds: skillRows.filter((row) => row.staff_id === person.id).map((row) => String(row.service_id)),
    shifts: shiftRows.filter((row) => row.staff_id === person.id)
      .map((row) => ({ weekday: Number(row.weekday), start: clock(Number(row.start_min)), end: clock(Number(row.end_min)) })),
  }));
  return { services: serviceRows as unknown as Service[], staff };
}

async function planDay(db: Client, serviceId: string, staffId: string, date: string, now: Date, options: PlanOptions): Promise<{ slots: string[]; duration: number }> {
  if (!bookingWindow(date, now, options.daysAhead))
    throw new BookingError(options.daysAhead === DEMO_DAYS_AHEAD ? "Odaberite datum u naredne tri sedmice." : `Odaberite datum od danas do ${options.daysAhead} dana unaprijed.`);
  const [service, capable, shift, busy, blocked] = (await db.batch([
    { sql: "SELECT duration_min FROM services WHERE id = ? AND active = 1", args: [serviceId] },
    { sql: "SELECT 1 AS ok FROM staff_services JOIN staff ON staff.id = staff_services.staff_id WHERE staff_id = ? AND service_id = ? AND staff.active = 1", args: [staffId, serviceId] },
    { sql: "SELECT start_min, end_min FROM shifts WHERE staff_id = ? AND weekday = ?", args: [staffId, weekdayOf(date)] },
    { sql: `SELECT start_min, end_min FROM bookings WHERE staff_id = ? AND date = ? AND status IN ${OCCUPYING} AND id <> ?`, args: [staffId, date, options.ignoreBookingId ?? ""] },
    { sql: "SELECT start_min, end_min FROM time_off WHERE staff_id = ? AND date = ?", args: [staffId, date] },
  ], "read")).map((result) => rows<Record<string, number>>(result));
  if (!service[0]) throw new BookingError("Usluga nije dostupna za zakazivanje.");
  if (!capable[0]) throw new BookingError("Izabrani član tima ne pruža tu uslugu.");
  const duration = service[0].duration_min;
  if (!shift[0]) return { slots: [], duration };
  const current = sarajevoNow(now);
  const slots: string[] = [];
  for (let start = shift[0].start_min; start + duration <= shift[0].end_min; start += 30) {
    const end = start + duration;
    if (!options.includeEarlierToday && date === current.date && start <= minutes(current.time)) continue;
    if ([...busy, ...blocked].some((item) => start < item.end_min && end > item.start_min)) continue;
    slots.push(clock(start));
  }
  return { slots, duration };
}

export async function getAvailability(db: Client, serviceId: string, staffId: string, date: string, now = new Date(), ignoreBookingId = ""): Promise<string[]> {
  return (await planDay(db, serviceId, staffId, date, now, { ...PUBLIC_PLAN, ignoreBookingId })).slots;
}

export async function getAdminAvailability(db: Client, serviceId: string, staffId: string, date: string, ignoreBookingId = "", now = new Date()): Promise<string[]> {
  return (await planDay(db, serviceId, staffId, date, now, { ...ADMIN_PLAN, ignoreBookingId })).slots;
}

export type NewBooking = { serviceId: string; staffId: string; date: string; time: string; clientName: string; clientPhone: string; source: string; note: string; clientId?: string | null };

export const MAX_UPCOMING_PER_CLIENT = 3;

async function insertBooking(db: Client, input: NewBooking, plan: PlanOptions, now: Date, limitPerClient = 0): Promise<Booking> {
  const clientName = input.clientName?.trim();
  if (!clientName || clientName.length < 2 || clientName.length > 80) throw new BookingError("Unesite ime od 2 do 80 znakova.");
  const start = minutes(input.time);
  if (start % 30 !== 0) throw new BookingError("Odaberite ponuđeni termin.");
  const { slots, duration } = await planDay(db, input.serviceId, input.staffId, input.date, now, plan);
  if (!slots.includes(input.time)) throw new BookingError("Termin više nije slobodan. Odaberite drugi.", 409);
  const end = start + duration;
  const booking: Booking = {
    id: randomUUID(), serviceId: input.serviceId, staffId: input.staffId, date: input.date, time: input.time,
    endTime: clock(end), clientName, status: "confirmed",
  };
  // One statement re-checks shift, bookings and time off, so two visitors can never get the same slot.
  const inserted = await db.execute({
    sql: `INSERT INTO bookings (id, service_id, staff_id, date, start_min, end_min, client_name, client_phone, source, note, client_id, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ? WHERE ${SLOT_FREE}${limitPerClient ? ` AND ${UPCOMING_COUNT} < ?` : ""}`,
    args: [
      booking.id, booking.serviceId, booking.staffId, booking.date, start, end, clientName, input.clientPhone, input.source, input.note, input.clientId ?? null, now.toISOString(),
      ...slotFreeArgs(booking.staffId, booking.date, start, end),
      ...(limitPerClient ? [input.clientId ?? "", sarajevoNow(now).date, limitPerClient] : []),
    ],
  });
  if (inserted.rowsAffected === 0 && limitPerClient) {
    const upcoming = await db.execute({ sql: `SELECT ${UPCOMING_COUNT} AS n`, args: [input.clientId ?? "", sarajevoNow(now).date] });
    if (Number(upcoming.rows[0].n) >= limitPerClient) throw new BookingError(`Možete imati najviše ${limitPerClient} zakazana termina. Otkažite jedan u „Moji termini“ ili pozovite salon.`, 409);
  }
  if (inserted.rowsAffected === 0) throw new BookingError("Termin više nije slobodan. Odaberite drugi.", 409);
  return booking;
}

// Online booking. With a clientId (a signed-in client) at most MAX_UPCOMING_PER_CLIENT future bookings are allowed.
export async function createBooking(db: Client, input: { serviceId: string; staffId: string; date: string; time: string; clientName: string; clientId?: string; clientPhone?: string }, now = new Date()): Promise<Booking> {
  return insertBooking(db, { ...input, clientPhone: input.clientPhone ?? "", source: "online", note: "" }, PUBLIC_PLAN, now, input.clientId ? MAX_UPCOMING_PER_CLIENT : 0);
}

// Staff entry for bookings agreed by phone, message or in the salon: any slot today and up to ADMIN_DAYS_AHEAD.
export async function createAdminBooking(db: Client, input: NewBooking, now = new Date()): Promise<Booking> {
  const clientPhone = input.clientPhone?.trim() ?? "";
  if (clientPhone && !/^\+?[\d\s/-]{6,20}$/.test(clientPhone)) throw new BookingError("Telefon može imati samo cifre, razmake, +, / i -.");
  if (!(ADMIN_SOURCES as readonly string[]).includes(input.source)) throw new BookingError("Odaberite kako je termin dogovoren.");
  const note = input.note?.trim() ?? "";
  if (note.length > 200) throw new BookingError("Napomena može imati najviše 200 znakova.");
  return insertBooking(db, { ...input, clientPhone, note }, ADMIN_PLAN, now);
}

export async function setBookingStatus(db: Client, id: string, status: string, now = new Date()) {
  if (!(VISIT_STATUSES as readonly string[]).includes(status)) throw new BookingError("Status nije ispravan.");
  const current = rows((await db.execute({ sql: "SELECT date, status FROM bookings WHERE id = ?", args: [id] })))[0];
  if (!current) throw new BookingError("Termin nije pronađen.", 404);
  if (current.status === "cancelled") throw new BookingError("Otkazan termin se ne može mijenjati.", 409);
  if (current.status === status) return;
  if (status !== "confirmed" && String(current.date) > sarajevoNow(now).date) throw new BookingError("Dolazak se može označiti tek na dan termina.");
  const unpaid = "(SELECT COALESCE(SUM(amount_fening), 0) FROM payments WHERE booking_id = bookings.id) = 0";
  if (current.status === "arrived") {
    const paid = await db.execute({ sql: `SELECT 1 AS ok FROM bookings WHERE id = ? AND NOT ${unpaid}`, args: [id] });
    if (paid.rows[0]) throw new BookingError("Termin ima evidentiranu naplatu. Prvo stornirajte naplatu.", 409);
  }
  const paidGuard = current.status === "arrived" ? ` AND ${unpaid}` : "";
  const guard = status === "no_show" ? "" : ` AND NOT EXISTS (SELECT 1 FROM bookings other WHERE other.id <> bookings.id AND other.staff_id = bookings.staff_id
    AND other.date = bookings.date AND other.status IN ${OCCUPYING} AND other.start_min < bookings.end_min AND other.end_min > bookings.start_min)`;
  const updated = await db.execute({ sql: `UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND status = ?${paidGuard}${guard}`, args: [status, now.toISOString(), id, current.status] });
  if (updated.rowsAffected > 0) return;
  const latest = rows((await db.execute({ sql: "SELECT status FROM bookings WHERE id = ?", args: [id] })))[0];
  if (latest?.status !== current.status) throw new BookingError("Termin je u međuvremenu promijenjen. Osvježite kalendar.", 409);
  throw new BookingError("To vrijeme je u međuvremenu zauzeto drugim terminom.", 409);
}

// Staff may move any confirmed booking; a client (clientId given) only their own, under the public booking rules.
export async function rescheduleBooking(db: Client, id: string, input: { staffId: string; date: string; time: string }, now = new Date(), clientId = "") {
  const current = rows((await db.execute({ sql: "SELECT service_id, status, client_id FROM bookings WHERE id = ?", args: [id] })))[0];
  if (!current || (clientId && current.client_id !== clientId)) throw new BookingError("Termin nije pronađen.", 404);
  if (current.status !== "confirmed") throw new BookingError("Premjestiti se može samo zakazan termin.", 409);
  const start = minutes(input.time);
  const { slots, duration } = await planDay(db, String(current.service_id), input.staffId, input.date, now, { ...(clientId ? PUBLIC_PLAN : ADMIN_PLAN), ignoreBookingId: id });
  if (!slots.includes(input.time)) throw new BookingError("Izabrano vrijeme nije slobodno.", 409);
  const end = start + duration;
  const updated = await db.execute({
    sql: `UPDATE bookings SET staff_id = ?, date = ?, start_min = ?, end_min = ?, updated_at = ? WHERE id = ? AND status = 'confirmed' AND ${SLOT_FREE}`,
    args: [input.staffId, input.date, start, end, now.toISOString(), id, ...slotFreeArgs(input.staffId, input.date, start, end, id)],
  });
  if (updated.rowsAffected === 0) throw new BookingError("Izabrano vrijeme nije slobodno.", 409);
  return { id, staffId: input.staffId, date: input.date, time: input.time, endTime: clock(end) };
}

export async function getDayBookings(db: Client, date: string) {
  if (!validDate(date)) throw new BookingError("Datum nije ispravan.");
  const result = await db.execute({ sql: `SELECT b.id, b.date, b.start_min, b.end_min, COALESCE(c.name, b.client_name) AS client_name, b.client_phone, b.source, b.note, b.status,
    b.service_id, s.name AS service_name, b.staff_id, p.name AS staff_name, b.client_id, COALESCE(c.blocked, 0) AS client_blocked,
    (SELECT COUNT(*) FROM bookings x WHERE x.client_id = b.client_id AND x.status = 'no_show' AND x.id <> b.id) AS client_no_shows
    FROM bookings b JOIN services s ON s.id = b.service_id JOIN staff p ON p.id = b.staff_id LEFT JOIN clients c ON c.id = b.client_id
    WHERE b.date = ? ORDER BY b.start_min, p.sort_order`, args: [date] });
  return rows(result).map((row) => ({
    id: row.id, date: row.date, time: clock(Number(row.start_min)), endTime: clock(Number(row.end_min)), clientName: row.client_name,
    clientPhone: row.client_phone, source: row.source, note: row.note, status: row.status,
    serviceId: row.service_id, serviceName: row.service_name, staffId: row.staff_id, staffName: row.staff_name,
    clientId: row.client_id, clientBlocked: Number(row.client_blocked) === 1, clientNoShows: Number(row.client_no_shows),
  }));
}

export async function cancelBooking(db: Client, id: string): Promise<boolean> {
  return (await db.execute({ sql: "UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'confirmed'", args: [new Date().toISOString(), id] })).rowsAffected > 0;
}

export async function blockTime(db: Client, input: { staffId: string; date: string; start: string; end: string; note?: string }) {
  if (!validDate(input.date)) throw new BookingError("Datum nije ispravan.");
  const start = minutes(input.start), end = minutes(input.end);
  if (end <= start) throw new BookingError("Kraj odsustva mora biti poslije početka.");
  const person = await db.execute({ sql: "SELECT 1 AS ok FROM staff WHERE id = ?", args: [input.staffId] });
  if (!person.rows[0]) throw new BookingError("Član tima nije pronađen.");
  const id = randomUUID();
  const inserted = await db.execute({
    sql: `INSERT INTO time_off (id, staff_id, date, start_min, end_min, note) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE staff_id = ? AND date = ? AND status IN ${OCCUPYING} AND start_min < ? AND end_min > ?)`,
    args: [id, input.staffId, input.date, start, end, input.note?.trim().slice(0, 120) ?? "", input.staffId, input.date, end, start],
  });
  if (inserted.rowsAffected === 0) throw new BookingError("Prvo premjestite ili otkažite rezervacije u ovom periodu.", 409);
  return { id };
}

export async function getDayBlocks(db: Client, date: string) {
  if (!validDate(date)) throw new BookingError("Datum nije ispravan.");
  const result = await db.execute({ sql: "SELECT t.id, t.staff_id, t.start_min, t.end_min, t.note, p.name AS staff_name FROM time_off t JOIN staff p ON p.id = t.staff_id WHERE t.date = ? ORDER BY t.start_min", args: [date] });
  return rows(result).map((row) => ({ id: row.id, staffId: row.staff_id, staffName: row.staff_name, start: clock(Number(row.start_min)), end: clock(Number(row.end_min)), note: row.note }));
}

export async function removeBlock(db: Client, id: string): Promise<boolean> {
  return (await db.execute({ sql: "DELETE FROM time_off WHERE id = ?", args: [id] })).rowsAffected > 0;
}

export async function setShift(db: Client, input: { staffId: string; weekday: number; start: string | null; end: string | null }) {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new BookingError("Dan nije ispravan.");
  if (!(await db.execute({ sql: "SELECT 1 AS ok FROM staff WHERE id = ?", args: [input.staffId] })).rows[0]) throw new BookingError("Član tima nije pronađen.");
  const currentDate = sarajevoNow().date;
  const future = `SELECT 1 FROM bookings WHERE staff_id = ? AND status IN ${OCCUPYING} AND date >= ? AND CAST(strftime('%w', date) AS INTEGER) = ?`;
  if (input.start === null && input.end === null) {
    const existing = await db.execute({ sql: `${future} LIMIT 1`, args: [input.staffId, currentDate, input.weekday] });
    if (existing.rows[0]) throw new BookingError("Prvo otkažite buduće rezervacije tog dana.", 409);
    await db.execute({ sql: "DELETE FROM shifts WHERE staff_id = ? AND weekday = ?", args: [input.staffId, input.weekday] });
    return;
  }
  if (!input.start || !input.end) throw new BookingError("Unesite početak i kraj smjene.");
  const start = minutes(input.start), end = minutes(input.end);
  if (end <= start) throw new BookingError("Kraj smjene mora biti poslije početka.");
  const conflict = await db.execute({ sql: `${future} AND (start_min < ? OR end_min > ?) LIMIT 1`, args: [input.staffId, currentDate, input.weekday, start, end] });
  if (conflict.rows[0]) throw new BookingError("Nova smjena ne pokriva postojeće rezervacije.", 409);
  await db.execute({
    sql: "INSERT INTO shifts (staff_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?) ON CONFLICT(staff_id, weekday) DO UPDATE SET start_min = excluded.start_min, end_min = excluded.end_min",
    args: [input.staffId, input.weekday, start, end],
  });
}

export async function updateStaff(db: Client, input: { id: string; name: string; bio: string }) {
  const name = input.name?.trim(), bio = input.bio?.trim();
  if (!name || name.length < 2 || name.length > 60) throw new BookingError("Ime mora imati od 2 do 60 znakova.");
  if (!bio || bio.length > 240) throw new BookingError("Opis mora imati od 1 do 240 znakova.");
  const updated = (await db.execute({ sql: "UPDATE staff SET name = ?, bio = ? WHERE id = ?", args: [name, bio, input.id] })).rowsAffected;
  if (!updated) throw new BookingError("Član tima nije pronađen.", 404);
}
