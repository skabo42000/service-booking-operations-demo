import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { dailyMaintenance, initialize } from "../lib/db.ts";
import { getDayBookings, setBookingStatus } from "../lib/booking.ts";
import { anonymizeClient, createAdminBookingForClient, findClientByPhone, findOrCreateClientByPhone, getClient, phoneKey, searchClients, searchName, updateClient } from "../lib/clients.ts";
import { recordPayment } from "../lib/payments.ts";

// Ponedjeljak 5. 10. 2026. u 15:00 po vremenu u Banjoj Luci.
const NOW = new Date("2026-10-05T13:00:00Z");
const booking = (overrides) => ({ serviceId: "nokti", staffId: "tim-1", date: "2026-10-05", time: "10:00", clientName: "Šejla Demo", clientPhone: "065 123 456", source: "phone", note: "", ...overrides });

async function freshDb() {
  const db = createClient({ url: ":memory:" });
  await initialize(db);
  return db;
}

test("telefon u različitim oblicima je isti broj", () => {
  for (const phone of ["065 123 456", "065/123-456", "+387 65 123 456", "0038765123456", "38765123456"]) assert.equal(phoneKey(phone), "38765123456", phone);
  assert.equal(phoneKey("+43 660 1234567"), "436601234567");
  assert.equal(phoneKey("123"), "");
  assert.equal(searchName("Šejla Đurđević"), "sejla djurdjevic");
});

test("termini sa istim telefonom idu istom klijentu, sa statistikom", async () => {
  const db = await freshDb();
  const first = await createAdminBookingForClient(db, booking(), NOW);
  await createAdminBookingForClient(db, booking({ time: "12:00", clientPhone: "+387 65 123-456" }), NOW);
  await createAdminBookingForClient(db, booking({ date: "2026-10-07", clientPhone: "0038765123456" }), NOW);
  await createAdminBookingForClient(db, booking({ time: "14:00", clientName: "Bez telefona", clientPhone: "" }), NOW);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM clients")).rows[0].n, 1);
  await setBookingStatus(db, first.id, "arrived", NOW);
  await recordPayment(db, first.id, { amount: "30", method: "cash" }, NOW);
  const day = await getDayBookings(db, "2026-10-05");
  await setBookingStatus(db, day.find((item) => item.time === "12:00").id, "no_show", NOW);
  const client = await findClientByPhone(db, "065 123 456", NOW);
  assert.deepEqual([client.visits, client.noShows, client.upcoming, client.totalPaid, client.lastVisit], [1, 1, 1, 3000, "2026-10-05"]);
  const refreshed = await getDayBookings(db, "2026-10-05");
  assert.equal(refreshed.find((item) => item.time === "10:00").clientNoShows, 1);
  assert.equal(refreshed.find((item) => item.time === "14:00").clientId, null);
  assert.equal((await getClient(db, client.id, NOW)).history.length, 3);
});

test("dva istovremena unosa istog broja prave jednog klijenta", async () => {
  const db = await freshDb();
  const ids = await Promise.all(["065 999 888", "+38765999888", "065-999-888"].map((phone) => findOrCreateClientByPhone(db, "Ista osoba", phone, NOW)));
  assert.equal(new Set(ids).size, 1);
});

test("pretraga bez kvačica i po dijelu telefona", async () => {
  const db = await freshDb();
  await createAdminBookingForClient(db, booking(), NOW);
  await createAdminBookingForClient(db, booking({ time: "12:00", clientName: "Ana Demo", clientPhone: "066 555 444" }), NOW);
  assert.deepEqual((await searchClients(db, "sejla", NOW)).map((client) => client.name), ["Šejla Demo"]);
  assert.deepEqual((await searchClients(db, "123 456", NOW)).map((client) => client.name), ["Šejla Demo"]);
  assert.deepEqual((await searchClients(db, "066", NOW)).map((client) => client.name), ["Ana Demo"]);
  assert.equal((await searchClients(db, "", NOW)).length, 2);
});

test("izmjena klijenta: tuđi broj je odbijen, blokada se čuva", async () => {
  const db = await freshDb();
  await createAdminBookingForClient(db, booking(), NOW);
  await createAdminBookingForClient(db, booking({ time: "12:00", clientName: "Ana Demo", clientPhone: "066 555 444" }), NOW);
  const ana = await findClientByPhone(db, "066 555 444", NOW);
  await assert.rejects(updateClient(db, ana.id, { name: "Ana Demo", phone: "+387 65 123 456", notes: "", blocked: false }, NOW), { status: 409 });
  await assert.rejects(updateClient(db, ana.id, { name: "Ana Demo", phone: "12", notes: "", blocked: false }, NOW), { status: 400 });
  await updateClient(db, ana.id, { name: "Ana Novo", phone: "066 555 444", notes: "Formula boje 7.1", blocked: true }, NOW);
  const saved = await getClient(db, ana.id, NOW);
  assert.deepEqual([saved.name, saved.notes, saved.blocked], ["Ana Novo", "Formula boje 7.1", true]);
  assert.equal((await getDayBookings(db, "2026-10-05")).find((item) => item.time === "12:00").clientName, "Ana Novo");
});

test("brisanje ličnih podataka čuva evidenciju naplate", async () => {
  const db = await freshDb();
  const past = await createAdminBookingForClient(db, booking(), NOW);
  await setBookingStatus(db, past.id, "arrived", NOW);
  await recordPayment(db, past.id, { amount: "30", method: "card" }, NOW);
  await createAdminBookingForClient(db, booking({ date: "2026-10-08" }), NOW);
  const client = await findClientByPhone(db, "065 123 456", NOW);
  assert.deepEqual(await anonymizeClient(db, client.id, NOW), { cancelledBookings: 1 });
  const after = await getClient(db, client.id, NOW);
  assert.deepEqual([after.name, after.phone, after.deleted, after.totalPaid], ["Obrisan klijent", "", true, 3000]);
  const rows = (await db.execute("SELECT client_name, client_phone FROM bookings")).rows;
  assert.ok(rows.every((row) => row.client_name === "Obrisan klijent" && row.client_phone === ""));
  assert.equal((await searchClients(db, "", NOW)).length, 0);
  assert.equal(await findClientByPhone(db, "065 123 456", NOW), null);
  await assert.rejects(anonymizeClient(db, client.id, NOW), { status: 404 });
});

test("noćni reset briše i klijente", async () => {
  const db = await freshDb();
  await createAdminBookingForClient(db, booking(), NOW);
  await dailyMaintenance(db, "2026-10-06", true);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM clients")).rows[0].n, 0);
});
