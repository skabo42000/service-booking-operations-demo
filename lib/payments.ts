import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { BookingError, clock, rows, sarajevoNow, validDate } from "./booking.ts";

export const PAYMENT_METHODS = ["cash", "card", "gift_card"] as const;
const MAX_FENING = 10_000 * 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Payment = { id: string; bookingId: string; amount: number; method: string; receiptNumber: string; reversesId: string | null; reversed: boolean; paidDate: string; createdAt: string };

// Money is kept in whole fenings (1 KM = 100 fening), so 0.1 + 0.2 style float errors can never appear.
export function parseAmount(value: string): number {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(String(value ?? "").trim());
  if (!match) throw new BookingError("Iznos upišite kao broj, npr. 25 ili 25,50.");
  const fening = Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
  if (fening <= 0 || fening > MAX_FENING) throw new BookingError("Iznos mora biti veći od 0 i najviše 10.000 KM.");
  return fening;
}

export function formatAmount(fening: number): string {
  const sign = fening < 0 ? "-" : "";
  const absolute = Math.abs(fening);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

function toPayment(row: Record<string, string | number | null>): Payment {
  return {
    id: String(row.id), bookingId: String(row.booking_id), amount: Number(row.amount_fening), method: String(row.method),
    receiptNumber: String(row.receipt_number), reversesId: row.reverses_id ? String(row.reverses_id) : null,
    reversed: Number(row.reversed ?? 0) > 0, paidDate: String(row.paid_date), createdAt: String(row.created_at),
  };
}

const PAYMENT_COLUMNS = "p.id, p.booking_id, p.amount_fening, p.method, p.receipt_number, p.reverses_id, p.paid_date, p.created_at, (SELECT COUNT(*) FROM payments r WHERE r.reverses_id = p.id) AS reversed";

// `requestId` is an idempotency key: a double click or a retried request stores the payment only once.
export async function recordPayment(db: Client, bookingId: string, input: { requestId?: string; amount: string; method: string; receiptNumber?: string }, now = new Date()): Promise<Payment> {
  const amount = parseAmount(input.amount);
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) throw new BookingError("Odaberite način plaćanja.");
  const receiptNumber = input.receiptNumber?.trim() ?? "";
  if (receiptNumber && !/^[\p{L}\d/_.\- ]{1,40}$/u.test(receiptNumber)) throw new BookingError("Broj računa može imati najviše 40 slova, cifara, /, -, _ ili tačaka.");
  const id = input.requestId && UUID.test(input.requestId) ? input.requestId.toLowerCase() : randomUUID();
  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO payments (id, booking_id, amount_fening, method, receipt_number, paid_date, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ? AND status = 'arrived')`,
    args: [id, bookingId, amount, input.method, receiptNumber, sarajevoNow(now).date, now.toISOString(), bookingId],
  });
  const saved = rows(await db.execute({ sql: `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = ?`, args: [id] }))[0];
  if (saved && String(saved.booking_id) === bookingId) return toPayment(saved);
  if (inserted.rowsAffected === 0 && saved) throw new BookingError("Ova naplata pripada drugom terminu.", 409);
  throw new BookingError("Naplata se evidentira tek kada je označen dolazak.", 409);
}

// Storno: the original row stays untouched and a negative copy is added; the unique index allows only one per payment.
export async function reversePayment(db: Client, paymentId: string, now = new Date()): Promise<Payment> {
  const original = rows(await db.execute({ sql: "SELECT amount_fening, reverses_id FROM payments WHERE id = ?", args: [paymentId] }))[0];
  if (!original) throw new BookingError("Naplata nije pronađena.", 404);
  if (original.reverses_id || Number(original.amount_fening) < 0) throw new BookingError("Storno se ne može ponovo stornirati.", 409);
  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO payments (id, booking_id, amount_fening, method, receipt_number, reverses_id, paid_date, created_at)
        SELECT ?, booking_id, -amount_fening, method, receipt_number, id, ?, ? FROM payments WHERE id = ?`,
      args: [id, sarajevoNow(now).date, now.toISOString(), paymentId],
    });
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw new BookingError("Naplata je već stornirana.", 409);
    throw error;
  }
  return toPayment(rows(await db.execute({ sql: `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.id = ?`, args: [id] }))[0]);
}

export async function getPaymentsForBookings(db: Client, bookingIds: string[]): Promise<Record<string, Payment[]>> {
  const grouped: Record<string, Payment[]> = {};
  if (bookingIds.length === 0) return grouped;
  const result = await db.execute({ sql: `SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.booking_id IN (${bookingIds.map(() => "?").join(", ")}) ORDER BY p.created_at`, args: bookingIds });
  for (const payment of rows(result).map(toPayment)) (grouped[payment.bookingId] ??= []).push(payment);
  return grouped;
}

export async function dailyReport(db: Client, date: string) {
  if (!validDate(date)) throw new BookingError("Datum nije ispravan.");
  const [methods, staff, services, visits] = (await db.batch([
    { sql: "SELECT method, SUM(amount_fening) AS total, SUM(amount_fening > 0) AS payments, SUM(amount_fening < 0) AS reversals FROM payments WHERE paid_date = ? GROUP BY method", args: [date] },
    { sql: "SELECT s.name AS name, SUM(p.amount_fening) AS total FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN staff s ON s.id = b.staff_id WHERE p.paid_date = ? GROUP BY s.id ORDER BY s.sort_order", args: [date] },
    { sql: "SELECT v.name AS name, SUM(p.amount_fening) AS total FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN services v ON v.id = b.service_id WHERE p.paid_date = ? GROUP BY v.id ORDER BY v.sort_order", args: [date] },
    { sql: `SELECT b.id, b.start_min, b.client_name, b.status, v.name AS service_name, s.name AS staff_name,
      COALESCE((SELECT SUM(amount_fening) FROM payments WHERE booking_id = b.id), 0) AS paid
      FROM bookings b JOIN services v ON v.id = b.service_id JOIN staff s ON s.id = b.staff_id
      WHERE b.date = ? AND b.status IN ('arrived', 'no_show') ORDER BY b.start_min`, args: [date] },
  ], "read")).map((result) => rows(result));
  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((method) => [method, 0])) as Record<string, number>;
  for (const row of methods) byMethod[String(row.method)] = Number(row.total);
  return {
    date,
    byMethod,
    total: Object.values(byMethod).reduce((sum, value) => sum + value, 0),
    paymentCount: methods.reduce((sum, row) => sum + Number(row.payments), 0),
    reversalCount: methods.reduce((sum, row) => sum + Number(row.reversals), 0),
    byStaff: staff.map((row) => ({ name: String(row.name), total: Number(row.total) })),
    byService: services.map((row) => ({ name: String(row.name), total: Number(row.total) })),
    arrived: visits.filter((row) => row.status === "arrived").length,
    noShows: visits.filter((row) => row.status === "no_show").length,
    unpaid: visits.filter((row) => row.status === "arrived" && Number(row.paid) === 0)
      .map((row) => ({ id: String(row.id), time: clock(Number(row.start_min)), clientName: String(row.client_name), serviceName: String(row.service_name), staffName: String(row.staff_name) })),
  };
}

const METHOD_LABELS: Record<string, string> = { cash: "Gotovina", card: "Kartica", gift_card: "Poklon bon" };

// Excel in BiH uses ";" as the list separator and "," for decimals. Text that starts with = + - @ could run as a
// formula when the file is opened, so such text cells get a leading apostrophe.
function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export async function paymentsCsv(db: Client, from: string, to: string): Promise<string> {
  if (!validDate(from) || !validDate(to) || from > to) throw new BookingError("Odaberite ispravan period.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) throw new BookingError("Period može biti najviše godinu dana.");
  const result = await db.execute({
    sql: `SELECT p.paid_date, p.created_at, b.date, b.start_min, v.name AS service_name, s.name AS staff_name, b.client_name, p.method, p.amount_fening, p.receipt_number, p.reverses_id, p.id
      FROM payments p JOIN bookings b ON b.id = p.booking_id JOIN services v ON v.id = b.service_id JOIN staff s ON s.id = b.staff_id
      WHERE p.paid_date BETWEEN ? AND ? ORDER BY p.paid_date, p.created_at`,
    args: [from, to],
  });
  const header = ["Datum naplate", "Vrijeme upisa (UTC)", "Datum termina", "Vrijeme termina", "Usluga", "Član tima", "Klijent", "Način plaćanja", "Iznos KM", "Broj fiskalnog računa", "Storno za", "ID naplate"];
  const lines = rows(result).map((row) => [
    String(row.paid_date), String(row.created_at).slice(0, 19).replace("T", " "), String(row.date), clock(Number(row.start_min)),
    csvText(String(row.service_name)), csvText(String(row.staff_name)), csvText(String(row.client_name)), METHOD_LABELS[String(row.method)] ?? String(row.method),
    formatAmount(Number(row.amount_fening)), csvText(String(row.receipt_number)), row.reverses_id ? String(row.reverses_id) : "", String(row.id),
  ].join(";"));
  return `﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`;
}
