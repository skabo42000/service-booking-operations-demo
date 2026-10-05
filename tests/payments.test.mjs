import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { dailyMaintenance, initialize } from "../lib/db.ts";
import { createAdminBooking, setBookingStatus } from "../lib/booking.ts";
import { dailyReport, formatAmount, parseAmount, paymentsCsv, recordPayment, reversePayment } from "../lib/payments.ts";

// Ponedjeljak 5. 10. 2026. u 15:00 po vremenu u Banjoj Luci.
const NOW = new Date("2026-10-05T13:00:00Z");
const DAY = "2026-10-05";

async function arrivedVisit(db, overrides = {}) {
  const booking = await createAdminBooking(db, { serviceId: "nokti", staffId: "tim-1", date: DAY, time: "10:00", clientName: "Klijent", clientPhone: "", source: "phone", note: "", ...overrides }, NOW);
  await setBookingStatus(db, booking.id, "arrived", NOW);
  return booking;
}

async function freshDb() {
  const db = createClient({ url: ":memory:" });
  await initialize(db);
  return db;
}

test("iznos se čuva u feninzima, bez decimalnih grešaka", () => {
  assert.equal(parseAmount("25"), 2500);
  assert.equal(parseAmount("25,5"), 2550);
  assert.equal(parseAmount(" 25.50 "), 2550);
  assert.equal(parseAmount("0,10"), 10);
  for (const wrong of ["0", "-5", "abc", "1.234,00", "25,555", "10000,01"]) assert.throws(() => parseAmount(wrong), { status: 400 }, wrong);
  assert.equal(formatAmount(2550), "25,50");
  assert.equal(formatAmount(-5), "-0,05");
});

test("naplata tek poslije dolaska, jednom po ključu zahtjeva", async () => {
  const db = await freshDb();
  const booking = await createAdminBooking(db, { serviceId: "nokti", staffId: "tim-1", date: DAY, time: "10:00", clientName: "Klijent", clientPhone: "", source: "phone", note: "" }, NOW);
  await assert.rejects(recordPayment(db, booking.id, { amount: "25", method: "cash" }, NOW), { status: 409 });
  await setBookingStatus(db, booking.id, "arrived", NOW);
  await assert.rejects(recordPayment(db, booking.id, { amount: "25", method: "crypto" }, NOW), { status: 400 });
  await assert.rejects(recordPayment(db, booking.id, { amount: "25", method: "cash", receiptNumber: "=1+1" }, NOW), { status: 400 });
  const requestId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const first = await recordPayment(db, booking.id, { requestId, amount: "25,00", method: "cash", receiptNumber: "FR-12/2026" }, NOW);
  const repeated = await recordPayment(db, booking.id, { requestId, amount: "25,00", method: "cash", receiptNumber: "FR-12/2026" }, NOW);
  assert.equal(first.id, repeated.id);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM payments")).rows[0].n, 1);
  assert.equal(first.paidDate, DAY);
});

test("storno dodaje minus red, samo jednom, i tek tada dozvoljava promjenu statusa", async () => {
  const db = await freshDb();
  const booking = await arrivedVisit(db);
  const payment = await recordPayment(db, booking.id, { amount: "40", method: "card" }, NOW);
  await assert.rejects(setBookingStatus(db, booking.id, "no_show", NOW), { status: 409 });
  const [first, second] = await Promise.allSettled([reversePayment(db, payment.id, NOW), reversePayment(db, payment.id, NOW)]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  assert.equal(second.reason.status, 409);
  assert.equal(first.value.amount, -4000);
  await assert.rejects(reversePayment(db, first.value.id, NOW), { status: 409 });
  const original = await db.execute({ sql: "SELECT amount_fening FROM payments WHERE id = ?", args: [payment.id] });
  assert.equal(original.rows[0].amount_fening, 4000);
  await setBookingStatus(db, booking.id, "no_show", NOW);
});

test("dnevni izvještaj sabira po načinu plaćanja, članu tima i usluzi", async () => {
  const db = await freshDb();
  const nails = await arrivedVisit(db);
  const hair = await arrivedVisit(db, { serviceId: "kosa", staffId: "tim-2", clientName: "Druga" });
  const unpaid = await arrivedVisit(db, { serviceId: "depilacija", staffId: "tim-2", time: "12:00", clientName: "Bez naplate" });
  const cash = await recordPayment(db, nails.id, { amount: "25", method: "cash" }, NOW);
  await recordPayment(db, nails.id, { amount: "10,50", method: "gift_card" }, NOW);
  await recordPayment(db, hair.id, { amount: "40", method: "card" }, NOW);
  await reversePayment(db, cash.id, NOW);
  await recordPayment(db, nails.id, { amount: "30", method: "cash" }, NOW);
  const report = await dailyReport(db, DAY);
  assert.deepEqual(report.byMethod, { cash: 3000, card: 4000, gift_card: 1050 });
  assert.equal(report.total, 8050);
  assert.equal(report.paymentCount, 4);
  assert.equal(report.reversalCount, 1);
  assert.deepEqual(report.byStaff, [{ name: "Član tima 1", total: 4050 }, { name: "Član tima 2", total: 4000 }]);
  assert.equal(report.arrived, 3);
  assert.deepEqual(report.unpaid.map((visit) => visit.id), [unpaid.id]);
});

test("CSV za Excel: BOM, tačka-zarez, decimalni zarez i zaštita od formula", async () => {
  const db = await freshDb();
  const booking = await arrivedVisit(db, { clientName: "=HYPERLINK(\"x\";\"klik\")" });
  const payment = await recordPayment(db, booking.id, { amount: "25,5", method: "cash", receiptNumber: "12" }, NOW);
  await reversePayment(db, payment.id, NOW);
  const csv = await paymentsCsv(db, DAY, DAY);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.ok(csv.startsWith("﻿Datum naplate;"));
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes(";\"'=HYPERLINK(\"\"x\"\";\"\"klik\"\")\";"));
  assert.ok(lines[1].includes(";Gotovina;25,50;12;;"));
  assert.ok(lines[2].includes(`;-25,50;12;${payment.id};`));
  await assert.rejects(paymentsCsv(db, "2026-10-05", "2026-10-01"), { status: 400 });
});

test("noćni reset briše i naplate", async () => {
  const db = await freshDb();
  const booking = await arrivedVisit(db);
  await recordPayment(db, booking.id, { amount: "25", method: "cash" }, NOW);
  await dailyMaintenance(db, "2026-10-06", true);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM payments")).rows[0].n, 0);
});
