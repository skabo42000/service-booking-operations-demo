import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { dailyMaintenance, initialize } from "../lib/db.ts";
import { createAdminBooking, getAvailability, getCatalog, setShift } from "../lib/booking.ts";
import {
  assertOwnBooking, canUseStaffColumn, demoKeyMatches, endStaffSession, getServices, getStaffUser, getTeam, listStaffLogins,
  saveService, saveTeamMember, startStaffSession,
} from "../lib/staff.ts";

// Ponedjeljak 5. 10. 2026. u 15:00 po vremenu u Banjoj Luci.
const NOW = new Date("2026-10-05T13:00:00Z");
const booking = (overrides) => ({ serviceId: "nokti", staffId: "tim-1", date: "2026-10-06", time: "10:00", clientName: "Klijent", clientPhone: "", source: "phone", note: "", ...overrides });

async function freshDb() {
  const db = createClient({ url: ":memory:" });
  await initialize(db);
  return db;
}

test("demo lozinka se poredi tačno i ne prihvata kratku lozinku", () => {
  const key = "x".repeat(24);
  assert.equal(demoKeyMatches(key, key), true);
  assert.equal(demoKeyMatches(`${key.slice(1)}y`, key), false);
  assert.equal(demoKeyMatches("kratka", "kratka"), false);
  assert.equal(demoKeyMatches("", ""), false);
});

test("osoblje: vlasnica i dvije radnice, sesija čuva samo otisak i ističe za 12 sati", async () => {
  const db = await freshDb();
  const logins = await listStaffLogins(db);
  assert.deepEqual(logins.map((user) => [user.name, user.role]), [["Vlasnica (demo)", "owner"], ["Član tima 1", "staff"], ["Član tima 2", "staff"]]);
  const token = await startStaffSession(db, "osoblje-tim-1", NOW);
  const user = await getStaffUser(db, token, NOW);
  assert.deepEqual([user.role, user.staffId, user.name], ["staff", "tim-1", "Član tima 1"]);
  assert.equal((await db.execute("SELECT token_hash FROM staff_sessions")).rows[0].token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(await getStaffUser(db, token, new Date(NOW.getTime() + 13 * 3600_000)), null);
  await endStaffSession(db, token);
  assert.equal(await getStaffUser(db, token, NOW), null);
  await assert.rejects(startStaffSession(db, "nepostoji", NOW), { status: 404 });
});

test("radnica dira samo svoju kolonu kalendara, vlasnica sve", async () => {
  const db = await freshDb();
  const owner = await getStaffUser(db, await startStaffSession(db, "osoblje-vlasnica", NOW), NOW);
  const first = await getStaffUser(db, await startStaffSession(db, "osoblje-tim-1", NOW), NOW);
  const theirs = await createAdminBooking(db, booking({ serviceId: "kosa", staffId: "tim-2" }), NOW);
  const mine = await createAdminBooking(db, booking(), NOW);
  assert.equal(canUseStaffColumn(first, "tim-1"), true);
  assert.equal(canUseStaffColumn(first, "tim-2"), false);
  assert.equal(canUseStaffColumn(owner, "tim-2"), true);
  await assertOwnBooking(db, first, mine.id);
  await assert.rejects(assertOwnBooking(db, first, theirs.id), { status: 403 });
  await assertOwnBooking(db, owner, theirs.id);
});

test("usluge: provjera unosa, cijena u feninzima ili prazna, neaktivna se ne nudi", async () => {
  const db = await freshDb();
  await assert.rejects(saveService(db, { category: "solarijum", name: "Solarijum", durationMinutes: 30, price: "", active: true }), { status: 400 });
  await assert.rejects(saveService(db, { category: "nokti", name: "Gel", durationMinutes: 20, price: "", active: true }), { status: 400 });
  await assert.rejects(saveService(db, { category: "nokti", name: "Gel", durationMinutes: 45, price: "-5", active: true }), { status: 400 });
  const { id } = await saveService(db, { category: "nokti", name: "Gel lak · demo", durationMinutes: 45, price: "25,50", active: true });
  await saveService(db, { id: "depilacija", category: "depilacija", name: "Depilacija · demo", durationMinutes: 30, price: "", active: false });
  const all = await getServices(db);
  assert.equal(all.find((service) => service.id === id).priceFening, 2550);
  assert.equal(all.find((service) => service.id === "nokti").priceFening, null);
  const catalog = await getCatalog(db);
  assert.ok(catalog.services.some((service) => service.id === id && service.priceFening === 2550));
  assert.ok(!catalog.services.some((service) => service.id === "depilacija"));
  await assert.rejects(saveService(db, { id: "nema", category: "nokti", name: "X usluga", durationMinutes: 30, price: "", active: true }), { status: 404 });
});

test("tim: nova radnica sa uslugom i smjenom, isti email odbijen", async () => {
  const db = await freshDb();
  const { id } = await saveTeamMember(db, { name: "Nova Radnica", bio: "Demo profil.", email: "Nova@Primjer.ba", serviceIds: ["kosa"], active: true }, NOW);
  assert.deepEqual(await getAvailability(db, "kosa", id, "2026-10-06", NOW), []);
  await setShift(db, { staffId: id, weekday: 2, start: "09:00", end: "12:00" });
  assert.deepEqual(await getAvailability(db, "kosa", id, "2026-10-06", NOW), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
  const member = (await getTeam(db)).find((person) => person.id === id);
  assert.deepEqual([member.email, member.serviceIds, member.active], ["nova@primjer.ba", ["kosa"], true]);
  assert.ok((await listStaffLogins(db)).some((user) => user.id === `osoblje-${id}` && user.role === "staff"));
  await assert.rejects(saveTeamMember(db, { name: "Druga", bio: "Opis.", email: "nova@primjer.ba", serviceIds: [], active: true }, NOW), { status: 409 });
  await assert.rejects(saveTeamMember(db, { name: "Treća", bio: "Opis.", email: "", serviceIds: ["nema"], active: true }, NOW), { status: 400 });
});

test("tim: nema gašenja ni oduzimanja usluge dok postoje budući termini", async () => {
  const db = await freshDb();
  const token = await startStaffSession(db, "osoblje-tim-1", NOW);
  await createAdminBooking(db, booking(), NOW);
  const base = { id: "tim-1", name: "Član tima 1", bio: "Demo profil za nokte i depilaciju.", email: "tim1@princess-demo.example" };
  await assert.rejects(saveTeamMember(db, { ...base, serviceIds: ["nokti", "depilacija"], active: false }, NOW), { status: 409 });
  await assert.rejects(saveTeamMember(db, { ...base, serviceIds: ["depilacija"], active: true }, NOW), /Njega noktiju/);
  await saveTeamMember(db, { ...base, serviceIds: ["nokti", "depilacija", "kosa"], active: true }, NOW);
  assert.ok((await getCatalog(db)).staff.find((person) => person.id === "tim-1").serviceIds.includes("kosa"));
  const idle = await saveTeamMember(db, { name: "Privremena", bio: "Opis.", email: "", serviceIds: [], active: true }, NOW);
  const idleToken = await startStaffSession(db, `osoblje-${idle.id}`, NOW);
  await saveTeamMember(db, { id: idle.id, name: "Privremena", bio: "Opis.", email: "", serviceIds: [], active: false }, NOW);
  assert.equal(await getStaffUser(db, idleToken, NOW), null);
  assert.ok(!(await getCatalog(db)).staff.some((person) => person.id === idle.id));
  assert.ok(await getStaffUser(db, token, NOW));
});

test("noćni reset vraća demo osoblje i briše dodate", async () => {
  const db = await freshDb();
  await saveTeamMember(db, { name: "Dodata", bio: "Opis.", email: "", serviceIds: [], active: true }, NOW);
  await startStaffSession(db, "osoblje-vlasnica", NOW);
  await dailyMaintenance(db, "2026-10-06", true, NOW);
  assert.equal((await listStaffLogins(db)).length, 3);
  assert.equal((await db.execute("SELECT COUNT(*) AS n FROM staff_sessions")).rows[0].n, 0);
});
