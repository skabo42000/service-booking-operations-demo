import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { dailyMaintenance, initialize, SCHEMA_VERSION } from "../lib/db.ts";
import { blockTime, bookingWindow, cancelBooking, createAdminBooking, createBooking, getAdminAvailability, getAvailability, getCatalog, getDayBookings, rescheduleBooking, sarajevoNow, setBookingStatus, setShift, updateStaff } from "../lib/booking.ts";
import { allowRequest, verifyHuman } from "../lib/protection.ts";

function nextWeekday(weekday) {
  const today = sarajevoNow().date;
  const base = new Date(`${today}T12:00:00Z`);
  const delta = (weekday - base.getUTCDay() + 7) % 7 || 7;
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

async function freshDb() {
  const db = createClient({ url: ":memory:" });
  await initialize(db);
  return db;
}

test("katalog ima tri usluge za zakazivanje, bez solarijuma", async () => {
  const catalog = await getCatalog(await freshDb());
  assert.deepEqual(catalog.services.map((service) => service.id), ["nokti", "kosa", "depilacija"]);
  assert.equal(catalog.staff.length, 2);
  assert.deepEqual(catalog.staff[0].serviceIds.sort(), ["depilacija", "nokti"]);
  assert.equal(catalog.staff[0].shifts.length, 6);
});

test("preklapanje termina je odbijeno, a otkazivanje oslobađa mjesto", async () => {
  const db = await freshDb();
  const date = nextWeekday(1);
  assert.ok((await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
  const booking = await createBooking(db, { serviceId: "nokti", staffId: "tim-1", date, time: "10:00", clientName: "Demo korisnik" });
  assert.equal(booking.status, "confirmed");
  await assert.rejects(createBooking(db, { serviceId: "nokti", staffId: "tim-1", date, time: "10:00", clientName: "Drugi korisnik" }), { status: 409 });
  await assert.rejects(createBooking(db, { serviceId: "nokti", staffId: "tim-1", date, time: "10:30", clientName: "Treći korisnik" }), { status: 409 });
  assert.ok(!(await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
  assert.equal(await cancelBooking(db, booking.id), true);
  assert.ok((await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
});

test("dva istovremena zahtjeva za isti termin daju samo jednu rezervaciju", async () => {
  const db = await freshDb();
  const date = nextWeekday(3);
  const attempts = await Promise.allSettled(["Prva", "Druga", "Treća"].map((clientName) =>
    createBooking(db, { serviceId: "depilacija", staffId: "tim-2", date, time: "11:00", clientName })));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.ok(attempts.filter((attempt) => attempt.status === "rejected").every((attempt) => attempt.reason.status === 409));
  const saved = await db.execute({ sql: "SELECT COUNT(*) AS n FROM bookings WHERE date = ? AND status = 'confirmed'", args: [date] });
  assert.equal(saved.rows[0].n, 1);
});

test("odsustvo blokira termine i ne može prekriti postojeću rezervaciju", async () => {
  const db = await freshDb();
  const date = nextWeekday(2);
  const booking = await createBooking(db, { serviceId: "kosa", staffId: "tim-2", date, time: "10:00", clientName: "Demo korisnik" });
  await assert.rejects(blockTime(db, { staffId: "tim-2", date, start: "10:30", end: "11:30" }), { status: 409 });
  await cancelBooking(db, booking.id);
  await blockTime(db, { staffId: "tim-2", date, start: "10:30", end: "11:30" });
  const slots = await getAvailability(db, "kosa", "tim-2", date);
  assert.ok(!slots.includes("10:00"));
  assert.ok(!slots.includes("11:00"));
  await assert.rejects(createBooking(db, { serviceId: "kosa", staffId: "tim-2", date, time: "11:00", clientName: "Demo korisnik" }), { status: 409 });
});

test("smjena određuje dostupnost, nedjelja je zatvorena", async () => {
  const db = await freshDb();
  const monday = nextWeekday(1);
  const sunday = nextWeekday(0);
  assert.deepEqual(await getAvailability(db, "nokti", "tim-1", sunday), []);
  await setShift(db, { staffId: "tim-1", weekday: 1, start: "12:00", end: "15:00" });
  assert.deepEqual(await getAvailability(db, "nokti", "tim-1", monday), ["12:00", "12:30", "13:00", "13:30", "14:00"]);
  assert.equal(bookingWindow("2026-02-30"), false);
  await assert.rejects(getAvailability(db, "solarijum", "tim-1", monday), { status: 400 });
});

test("ponovno pokretanje ne vraća obrisanu smjenu", async () => {
  const db = await freshDb();
  await setShift(db, { staffId: "tim-1", weekday: 6, start: null, end: null });
  await initialize(db);
  assert.deepEqual(await getAvailability(db, "nokti", "tim-1", nextWeekday(6)), []);
});

test("noćni reset briše probne podatke jednom dnevno", async () => {
  const db = await freshDb();
  const date = nextWeekday(4);
  assert.equal(await dailyMaintenance(db, "2026-09-26", true), true);
  await createBooking(db, { serviceId: "nokti", staffId: "tim-1", date, time: "10:00", clientName: "Demo korisnik" });
  await updateStaff(db, { id: "tim-1", name: "Promijenjeno ime", bio: "Promijenjen opis." });
  assert.equal(await dailyMaintenance(db, "2026-09-26", true), false);
  assert.ok(!(await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
  assert.equal(await dailyMaintenance(db, "2026-09-27", true), true);
  assert.ok((await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
  assert.equal((await getCatalog(db)).staff[0].name, "Član tima 1");
  assert.equal(await dailyMaintenance(db, "2026-09-28", false), true);
  await createBooking(db, { serviceId: "nokti", staffId: "tim-1", date, time: "10:00", clientName: "Demo korisnik" });
  await dailyMaintenance(db, "2026-09-29", false);
  assert.ok(!(await getAvailability(db, "nokti", "tim-1", date)).includes("10:00"));
});

test("ograničenje zahtjeva broji po ključu i vremenskom prozoru", async () => {
  const db = await freshDb();
  const now = new Date("2026-09-26T10:00:00Z");
  const results = [];
  for (let attempt = 0; attempt < 4; attempt++) results.push(await allowRequest(db, "booking:a", 3, 3600, now));
  assert.deepEqual(results, [true, true, true, false]);
  assert.equal(await allowRequest(db, "booking:b", 3, 3600, now), true);
  assert.equal(await allowRequest(db, "booking:a", 3, 3600, new Date("2026-09-26T11:00:00Z")), true);
  await dailyMaintenance(db, "2026-09-28", false, new Date("2026-09-28T10:00:00Z"));
  const left = await db.execute("SELECT COUNT(*) AS n FROM rate_limits");
  assert.equal(left.rows[0].n, 0);
});

test("provjera da nije robot", async () => {
  const answer = (success) => async () => new Response(JSON.stringify({ success }));
  assert.deepEqual(await verifyHuman(undefined, { secret: "", required: false }), { ok: true });
  assert.equal((await verifyHuman("token", { secret: "", required: true })).status, 503);
  assert.equal((await verifyHuman("", { secret: "tajna", fetcher: answer(true) })).status, 400);
  assert.deepEqual(await verifyHuman("token", { secret: "tajna", fetcher: answer(true) }), { ok: true });
  assert.equal((await verifyHuman("token", { secret: "tajna", fetcher: answer(false) })).status, 400);
  assert.equal((await verifyHuman("token", { secret: "tajna", fetcher: async () => { throw new Error("mreža"); } })).status, 503);
});

// Ponedjeljak 5. 10. 2026. u 15:00 po vremenu u Banjoj Luci.
const MONDAY_3PM = new Date("2026-10-05T13:00:00Z");
const adminInput = (overrides) => ({ serviceId: "nokti", staffId: "tim-1", date: "2026-10-05", time: "10:00", clientName: "Klijent telefonom", clientPhone: "", source: "phone", note: "", ...overrides });

test("stara baza se nadograđuje bez gubitka termina", async () => {
  const db = createClient({ url: ":memory:" });
  await db.batch([
    "CREATE TABLE services (id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, duration_min INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL)",
    "CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL)",
    "CREATE TABLE bookings (id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id), staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, client_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')), created_at TEXT NOT NULL)",
    "INSERT INTO services VALUES ('nokti', 'nokti', 'Njega noktiju · demo', 60, 1, 1)",
    "INSERT INTO staff VALUES ('tim-1', 'Član tima 1', 'Demo profil.', 1, 1)",
    "INSERT INTO bookings VALUES ('stari', 'nokti', 'tim-1', '2026-10-05', 600, 660, 'Stari termin', 'confirmed', '2026-09-26T10:00:00Z')",
  ], "write");
  await initialize(db);
  await initialize(db);
  const row = (await db.execute("SELECT client_name, client_phone, source, status FROM bookings WHERE id = 'stari'")).rows[0];
  assert.deepEqual([row.client_name, row.client_phone, row.source, row.status], ["Stari termin", "", "online", "confirmed"]);
  await db.execute("UPDATE bookings SET status = 'arrived' WHERE id = 'stari'");
  assert.equal((await db.execute("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0].value, String(SCHEMA_VERSION));
});

test("osoblje unosi termine koje javna forma ne nudi", async () => {
  const db = await freshDb();
  assert.ok(!(await getAvailability(db, "nokti", "tim-1", "2026-10-05", MONDAY_3PM)).includes("10:00"));
  assert.ok((await getAdminAvailability(db, "nokti", "tim-1", "2026-10-05", "", MONDAY_3PM)).includes("10:00"));
  await assert.rejects(getAvailability(db, "nokti", "tim-1", "2026-11-14", MONDAY_3PM), { status: 400 });
  assert.ok((await getAdminAvailability(db, "nokti", "tim-1", "2026-11-14", "", MONDAY_3PM)).includes("10:00"));
  await assert.rejects(getAdminAvailability(db, "nokti", "tim-1", "2027-01-05", "", MONDAY_3PM), { status: 400 });
  await assert.rejects(createAdminBooking(db, adminInput({ source: "online" }), MONDAY_3PM), { status: 400 });
  await assert.rejects(createAdminBooking(db, adminInput({ clientPhone: "zovi me" }), MONDAY_3PM), { status: 400 });
  await assert.rejects(createAdminBooking(db, adminInput({ note: "x".repeat(201) }), MONDAY_3PM), { status: 400 });
  await createAdminBooking(db, adminInput({ clientPhone: " +387 65 123-456 ", source: "message", note: "Dogovoreno porukom" }), MONDAY_3PM);
  const [saved] = await getDayBookings(db, "2026-10-05");
  assert.deepEqual([saved.clientPhone, saved.source, saved.note, saved.status], ["+387 65 123-456", "message", "Dogovoreno porukom", "confirmed"]);
  await assert.rejects(createAdminBooking(db, adminInput({ time: "10:30" }), MONDAY_3PM), { status: 409 });
});

test("dolazak i nedolazak", async () => {
  const db = await freshDb();
  const early = await createAdminBooking(db, adminInput(), MONDAY_3PM);
  const tomorrow = await createAdminBooking(db, adminInput({ date: "2026-10-06" }), MONDAY_3PM);
  await assert.rejects(setBookingStatus(db, tomorrow.id, "arrived", MONDAY_3PM), { status: 400 });
  await assert.rejects(setBookingStatus(db, early.id, "cancelled", MONDAY_3PM), { status: 400 });
  await setBookingStatus(db, early.id, "no_show", MONDAY_3PM);
  const walkIn = await createAdminBooking(db, adminInput({ clientName: "Došla bez najave", source: "walk_in" }), MONDAY_3PM);
  await assert.rejects(setBookingStatus(db, early.id, "arrived", MONDAY_3PM), { status: 409 });
  await setBookingStatus(db, walkIn.id, "arrived", MONDAY_3PM);
  await setBookingStatus(db, walkIn.id, "confirmed", MONDAY_3PM);
  assert.equal(await cancelBooking(db, walkIn.id), true);
  await assert.rejects(setBookingStatus(db, walkIn.id, "arrived", MONDAY_3PM), { status: 409 });
  await setBookingStatus(db, early.id, "arrived", MONDAY_3PM);
  const statuses = Object.fromEntries((await getDayBookings(db, "2026-10-05")).map((booking) => [booking.clientName, booking.status]));
  assert.deepEqual(statuses, { "Klijent telefonom": "arrived", "Došla bez najave": "cancelled" });
  await assert.rejects(blockTime(db, { staffId: "tim-1", date: "2026-10-05", start: "10:00", end: "10:30" }), { status: 409 });
});

test("premještanje termina", async () => {
  const db = await freshDb();
  const date = "2026-10-06";
  const nails = await createAdminBooking(db, adminInput({ date }), MONDAY_3PM);
  const wax = await createAdminBooking(db, adminInput({ date, serviceId: "depilacija", time: "12:00" }), MONDAY_3PM);
  const moved = await rescheduleBooking(db, nails.id, { staffId: "tim-1", date, time: "10:30" }, MONDAY_3PM);
  assert.equal(moved.endTime, "11:30");
  await assert.rejects(rescheduleBooking(db, nails.id, { staffId: "tim-1", date, time: "11:30" }, MONDAY_3PM), { status: 409 });
  await assert.rejects(rescheduleBooking(db, nails.id, { staffId: "tim-2", date, time: "10:00" }, MONDAY_3PM), { status: 400 });
  await rescheduleBooking(db, wax.id, { staffId: "tim-2", date: "2026-10-07", time: "12:00" }, MONDAY_3PM);
  assert.ok((await getAvailability(db, "depilacija", "tim-1", date, MONDAY_3PM)).includes("12:00"));
  assert.ok(!(await getAvailability(db, "depilacija", "tim-2", "2026-10-07", MONDAY_3PM)).includes("12:00"));
  await cancelBooking(db, nails.id);
  await assert.rejects(rescheduleBooking(db, nails.id, { staffId: "tim-1", date, time: "14:00" }, MONDAY_3PM), { status: 409 });
});
