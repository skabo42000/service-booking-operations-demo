import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { initialize } from "../lib/db.ts";
import { createBooking, rescheduleBooking } from "../lib/booking.ts";
import { anonymizeClient, createAdminBookingForClient } from "../lib/clients.ts";
import {
  cancelMyBooking, checkGoogleClaims, createSession, getAccount, getMyBookings, googleFinish, googleStart, readCookie, safeNext,
  sameOrigin, startEmailLogin, updateProfile, verifyEmailLogin,
} from "../lib/auth.ts";

// Ponedjeljak 5. 10. 2026. u 15:00 po vremenu u Banjoj Luci.
const NOW = new Date("2026-10-05T13:00:00Z");

async function freshDb() {
  const db = createClient({ url: ":memory:" });
  await initialize(db);
  return db;
}

async function signIn(db, email = "Ana@Primjer.ba") {
  const { challengeId, code } = await startEmailLogin(db, email, NOW);
  return verifyEmailLogin(db, challengeId, code, NOW);
}

test("prijava kodom: pogrešan kod, pa tačan, pa ponovna upotreba", async () => {
  const db = await freshDb();
  await assert.rejects(startEmailLogin(db, "nije-email", NOW), { status: 400 });
  const { challengeId, code, email } = await startEmailLogin(db, " Ana@Primjer.BA ", NOW);
  assert.equal(email, "ana@primjer.ba");
  const stored = (await db.execute("SELECT code_hash FROM login_codes")).rows[0].code_hash;
  assert.notEqual(stored, code);
  const wrong = code === "000000" ? "111111" : "000000";
  await assert.rejects(verifyEmailLogin(db, challengeId, wrong, NOW), /Preostalo pokušaja: 4/);
  const token = await verifyEmailLogin(db, challengeId, code, NOW);
  const account = await getAccount(db, token, NOW);
  assert.equal(account.email, "ana@primjer.ba");
  assert.equal(account.name, "");
  await assert.rejects(verifyEmailLogin(db, challengeId, code, NOW), { status: 400 });
  const session = (await db.execute("SELECT token_hash FROM sessions")).rows[0].token_hash;
  assert.equal(session, createHash("sha256").update(token).digest("hex"));
  assert.equal(await getAccount(db, token, new Date(NOW.getTime() + 31 * 86_400_000)), null);
});

test("kod ističe i ima najviše pet pokušaja, i kada se pogađa paralelno", async () => {
  const db = await freshDb();
  const late = await startEmailLogin(db, "ana@primjer.ba", NOW);
  await assert.rejects(verifyEmailLogin(db, late.challengeId, late.code, new Date(NOW.getTime() + 11 * 60_000)), /istekao/);
  const { challengeId, code } = await startEmailLogin(db, "ana@primjer.ba", NOW);
  const wrong = code === "000000" ? "111111" : "000000";
  await Promise.allSettled(Array.from({ length: 12 }, () => verifyEmailLogin(db, challengeId, wrong, NOW)));
  assert.equal((await db.execute({ sql: "SELECT attempts FROM login_codes WHERE id = ?", args: [challengeId] })).rows[0].attempts, 5);
  await assert.rejects(verifyEmailLogin(db, challengeId, code, NOW), /istekao ili je pokušano previše/);
});

test("isti email je isti klijent; profil ne može preuzeti tuđi broj", async () => {
  const db = await freshDb();
  const first = await getAccount(db, await signIn(db), NOW);
  const second = await getAccount(db, await signIn(db, "ana@primjer.ba"), NOW);
  assert.equal(first.id, second.id);
  await createAdminBookingForClient(db, { serviceId: "nokti", staffId: "tim-1", date: "2026-10-06", time: "10:00", clientName: "Telefonom", clientPhone: "065 111 222", source: "phone", note: "" }, NOW);
  await assert.rejects(updateProfile(db, first.id, { name: "Ana", phone: "+387 65 111 222" }, NOW), { status: 409 });
  await assert.rejects(updateProfile(db, first.id, { name: "A", phone: "" }, NOW), { status: 400 });
  await updateProfile(db, first.id, { name: "Ana Demo", phone: "066 222 333" }, NOW);
  const token = await signIn(db);
  assert.deepEqual([(await getAccount(db, token, NOW)).name, (await getAccount(db, token, NOW)).phone], ["Ana Demo", "066 222 333"]);
});

test("online: najviše tri zakazana termina, otkazivanje i promjena samo svojih", async () => {
  const db = await freshDb();
  const ana = await getAccount(db, await signIn(db), NOW);
  const other = await getAccount(db, await signIn(db, "druga@primjer.ba"), NOW);
  const book = (clientId, date, time) => createBooking(db, { serviceId: "depilacija", staffId: "tim-2", date, time, clientName: "Demo", clientId }, NOW);
  const first = await book(ana.id, "2026-10-06", "10:00");
  await book(ana.id, "2026-10-06", "11:00");
  await book(ana.id, "2026-10-07", "10:00");
  await assert.rejects(book(ana.id, "2026-10-07", "11:00"), /najviše 3/);
  const theirs = await book(other.id, "2026-10-08", "10:00");
  await assert.rejects(cancelMyBooking(db, ana.id, theirs.id, NOW), { status: 409 });
  await assert.rejects(rescheduleBooking(db, theirs.id, { staffId: "tim-2", date: "2026-10-08", time: "12:00" }, NOW, ana.id), { status: 404 });
  await assert.rejects(rescheduleBooking(db, first.id, { staffId: "tim-2", date: "2026-11-20", time: "10:00" }, NOW, ana.id), { status: 400 });
  await rescheduleBooking(db, first.id, { staffId: "tim-1", date: "2026-10-06", time: "12:00" }, NOW, ana.id);
  await cancelMyBooking(db, ana.id, first.id, NOW);
  await book(ana.id, "2026-10-07", "11:00");
  const mine = await getMyBookings(db, ana.id, NOW);
  assert.equal(mine.length, 4);
  assert.deepEqual(mine.filter((item) => item.canChange).length, 3);
  await assert.rejects(cancelMyBooking(db, ana.id, first.id, NOW), { status: 409 });
});

test("brisanje naloga odjavljuje i briše lične podatke", async () => {
  const db = await freshDb();
  const token = await signIn(db);
  const account = await getAccount(db, token, NOW);
  await anonymizeClient(db, account.id, NOW);
  assert.equal(await getAccount(db, token, NOW), null);
  const fresh = await getAccount(db, await signIn(db), NOW);
  assert.notEqual(fresh.id, account.id);
});

test("Google: state, PKCE i provjera podataka iz tokena", async () => {
  const db = await freshDb();
  const config = { clientId: "demo-client.apps.googleusercontent.com", clientSecret: "demo-secret" };
  const start = googleStart(config, "http://localhost:3000");
  const url = new URL(start.url);
  const [state, verifier] = start.cookie.split(".");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/google/callback");
  const claims = { iss: "https://accounts.google.com", aud: config.clientId, exp: Math.floor(NOW.getTime() / 1000) + 300, email: "Gordana@Gmail.com", email_verified: true, name: "Gordana Demo" };
  const idToken = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.potpis`;
  let sentBody = "";
  const fetcher = async (_url, init) => { sentBody = String(init.body); return new Response(JSON.stringify({ id_token: idToken(claims) })); };
  await assert.rejects(googleFinish(db, { code: "c", state: "pogresno", cookie: start.cookie, origin: "http://localhost:3000", config, fetcher, now: NOW }), { status: 400 });
  const token = await googleFinish(db, { code: "c", state, cookie: `${start.cookie}.%2Fzakazivanje`, origin: "http://localhost:3000", config, fetcher, now: NOW });
  assert.ok(sentBody.includes(`code_verifier=${verifier}`));
  const account = await getAccount(db, token, NOW);
  assert.deepEqual([account.email, account.name], ["gordana@gmail.com", "Gordana Demo"]);
  assert.throws(() => checkGoogleClaims({ ...claims, aud: "drugi" }, config.clientId, NOW), { status: 400 });
  assert.throws(() => checkGoogleClaims({ ...claims, email_verified: false }, config.clientId, NOW), { status: 400 });
  assert.throws(() => checkGoogleClaims({ ...claims, exp: 1 }, config.clientId, NOW), { status: 400 });
  assert.throws(() => checkGoogleClaims({ ...claims, iss: "https://evil.example" }, config.clientId, NOW), { status: 400 });
});

test("sigurnosne pomoćne funkcije", async () => {
  assert.equal(safeNext("/zakazivanje?usluga=kosa"), "/zakazivanje?usluga=kosa");
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)", ""]) assert.equal(safeNext(bad), "/moji-termini", bad);
  const request = new Request("https://princess.example/api/me", { headers: { cookie: "a=1; princess_session=abc%3D; b=2", origin: "https://princess.example" } });
  assert.equal(readCookie(request, "princess_session"), "abc=");
  assert.equal(sameOrigin(request), true);
  assert.equal(sameOrigin(new Request("https://princess.example/api/me", { headers: { origin: "https://evil.example" } })), false);
  assert.equal(sameOrigin(new Request("https://princess.example/api/me")), false);
  assert.equal(sameOrigin(new Request("https://princess.example/api/me", { headers: { origin: "http://princess.example" } })), false);
  const db = await freshDb();
  assert.equal(await getAccount(db, "nepostojeci", NOW), null);
  assert.ok((await createSession(db, (await getAccount(db, await signIn(db), NOW)).id, NOW)).length >= 40);
});
