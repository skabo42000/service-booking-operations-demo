import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Client } from "@libsql/client";
import { BookingError, clock, rows, sarajevoNow } from "./booking.ts";
import { findOrCreateClientByEmail, phoneKey, searchName } from "./clients.ts";

export const SESSION_COOKIE = "princess_session";
export const OAUTH_COOKIE = "princess_oauth";
const SESSION_SECONDS = 30 * 86_400;
const CODE_SECONDS = 10 * 60;
const MAX_CODE_ATTEMPTS = 5;

export type Account = { id: string; name: string; phone: string; email: string; blocked: boolean };

const seconds = (now: Date) => Math.floor(now.getTime() / 1000);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const base64url = (value: Buffer) => value.toString("base64url");

// Rate-limit keys use a hash, so raw email addresses never land in the counters table.
export function emailKey(email: string): string {
  return sha256(normalizeEmail(email)).slice(0, 32);
}

// Only same-site paths are allowed after sign-in; "//evil.example" or a full URL would be an open redirect.
export function safeNext(value: string | null | undefined, fallback = "/moji-termini"): string {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && next.length < 300 ? next : fallback;
}

export async function myBookingService(db: Client, clientId: string, bookingId: string): Promise<string> {
  const row = rows(await db.execute({ sql: "SELECT service_id FROM bookings WHERE id = ? AND client_id = ?", args: [bookingId, clientId] }))[0];
  if (!row) throw new BookingError("Termin nije pronađen.", 404);
  return String(row.service_id);
}

export function normalizeEmail(email: string): string {
  const clean = String(email ?? "").trim().toLowerCase();
  if (clean.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) throw new BookingError("Unesite ispravnu email adresu.");
  return clean;
}

// A 6-digit code is only safe because each code gets few attempts, expires quickly and is stored as a hash.
export async function startEmailLogin(db: Client, email: string, now = new Date()): Promise<{ challengeId: string; code: string; email: string }> {
  const address = normalizeEmail(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challengeId = randomUUID();
  await db.execute({
    sql: "INSERT INTO login_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [challengeId, address, sha256(`${challengeId}:${code}`), seconds(now) + CODE_SECONDS, seconds(now)],
  });
  return { challengeId, code, email: address };
}

export async function verifyEmailLogin(db: Client, challengeId: string, code: string, now = new Date()): Promise<string> {
  if (!/^\d{6}$/.test(String(code ?? "").trim())) throw new BookingError("Kod ima 6 cifara.");
  // Counting the attempt and reading the hash is one statement, so parallel guesses cannot skip the limit.
  const challenge = rows(await db.execute({
    sql: "UPDATE login_codes SET attempts = attempts + 1 WHERE id = ? AND used = 0 AND expires_at > ? AND attempts < ? RETURNING email, code_hash, attempts",
    args: [String(challengeId ?? ""), seconds(now), MAX_CODE_ATTEMPTS],
  }))[0];
  if (!challenge) throw new BookingError("Kod je istekao ili je pokušano previše puta. Zatražite novi kod.", 400);
  const expected = Buffer.from(String(challenge.code_hash), "hex");
  const given = Buffer.from(sha256(`${challengeId}:${String(code).trim()}`), "hex");
  if (!timingSafeEqual(expected, given)) {
    const left = MAX_CODE_ATTEMPTS - Number(challenge.attempts);
    throw new BookingError(left > 0 ? `Kod nije tačan. Preostalo pokušaja: ${left}.` : "Kod nije tačan. Zatražite novi kod.", 400);
  }
  const claimed = await db.execute({ sql: "UPDATE login_codes SET used = 1 WHERE id = ? AND used = 0", args: [challengeId] });
  if (claimed.rowsAffected === 0) throw new BookingError("Kod je već iskorišten. Zatražite novi kod.", 400);
  return createSession(db, await findOrCreateClientByEmail(db, String(challenge.email), "", now), now);
}

// The browser keeps a random token; the database keeps only its hash, so a leaked database cannot log anyone in.
export async function createSession(db: Client, clientId: string, now = new Date()): Promise<string> {
  const token = base64url(randomBytes(32));
  await db.execute({
    sql: "INSERT INTO sessions (id, token_hash, client_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [randomUUID(), sha256(token), clientId, seconds(now) + SESSION_SECONDS, seconds(now)],
  });
  return token;
}

export async function getAccount(db: Client, token: string, now = new Date()): Promise<Account | null> {
  if (!token || token.length > 100) return null;
  const row = rows(await db.execute({
    sql: `SELECT c.id, c.name, c.phone, c.email, c.blocked FROM sessions s JOIN clients c ON c.id = s.client_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND c.deleted_at = ''`,
    args: [sha256(token), seconds(now)],
  }))[0];
  return row ? { id: String(row.id), name: String(row.name), phone: String(row.phone), email: String(row.email), blocked: Number(row.blocked) === 1 } : null;
}

export async function endSession(db: Client, token: string) {
  if (token) await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [sha256(token)] });
}

export async function updateProfile(db: Client, clientId: string, input: { name: string; phone: string }, now = new Date()) {
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) throw new BookingError("Ime mora imati od 2 do 80 znakova.");
  const phone = String(input.phone ?? "").trim();
  const key = phoneKey(phone);
  if (phone && !key) throw new BookingError("Telefon nije ispravan. Primjer: 065 123 456.");
  try {
    await db.execute({
      sql: "UPDATE clients SET name = ?, search_name = ?, phone = ?, phone_key = ?, updated_at = ? WHERE id = ? AND deleted_at = ''",
      args: [name, searchName(name), phone, key, now.toISOString(), clientId],
    });
  } catch (error) {
    // Linking to an existing phone record would reveal its history, so the salon has to merge those by hand.
    if (String(error).includes("UNIQUE")) throw new BookingError("Ovaj broj je već u kartoteci salona. Sačuvajte profil bez broja ili pozovite salon da povežu nalog.", 409);
    throw error;
  }
}

export async function getMyBookings(db: Client, clientId: string, now = new Date()) {
  const result = await db.execute({
    sql: `SELECT b.id, b.date, b.start_min, b.end_min, b.status, b.service_id, v.name AS service_name, b.staff_id, s.name AS staff_name
      FROM bookings b JOIN services v ON v.id = b.service_id JOIN staff s ON s.id = b.staff_id
      WHERE b.client_id = ? ORDER BY b.date DESC, b.start_min DESC LIMIT 60`,
    args: [clientId],
  });
  const current = sarajevoNow(now);
  return rows(result).map((row) => {
    const time = clock(Number(row.start_min));
    const future = String(row.date) > current.date || (row.date === current.date && time > current.time);
    return {
      id: String(row.id), date: String(row.date), time, endTime: clock(Number(row.end_min)), status: String(row.status),
      serviceId: String(row.service_id), serviceName: String(row.service_name), staffId: String(row.staff_id), staffName: String(row.staff_name),
      canChange: row.status === "confirmed" && future,
    };
  });
}

export async function cancelMyBooking(db: Client, clientId: string, bookingId: string, now = new Date()) {
  const current = sarajevoNow(now);
  const updated = await db.execute({
    sql: `UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ? AND client_id = ? AND status = 'confirmed'
      AND (date > ? OR (date = ? AND start_min > ?))`,
    args: [now.toISOString(), bookingId, clientId, current.date, current.date, Number(current.time.slice(0, 2)) * 60 + Number(current.time.slice(3))],
  });
  if (updated.rowsAffected === 0) throw new BookingError("Ovaj termin se više ne može otkazati.", 409);
}

// --- Google sign-in: OAuth 2.0 authorization code flow with PKCE and a state value ---

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleStart(config: GoogleConfig, origin: string): { url: string; cookie: string } {
  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: `${origin}/api/auth/google/callback`, response_type: "code", scope: "openid email profile",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: `${state}.${verifier}` };
}

export function checkGoogleClaims(claims: Record<string, unknown>, clientId: string, now = new Date()): { email: string; name: string } {
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!issuerOk || claims.aud !== clientId || Number(claims.exp) * 1000 <= now.getTime()) throw new BookingError("Google prijava nije potvrđena.", 400);
  if (claims.email_verified !== true || typeof claims.email !== "string") throw new BookingError("Google nalog nema potvrđenu email adresu.", 400);
  return { email: normalizeEmail(claims.email), name: typeof claims.name === "string" ? claims.name.slice(0, 80) : "" };
}

// The ID token comes straight from Google's token endpoint over TLS, which OpenID Connect accepts in place of a
// signature check; issuer, audience, expiry and verified email are still checked.
export async function googleFinish(db: Client, input: { code: string; state: string; cookie: string; origin: string; config: GoogleConfig; fetcher?: typeof fetch; now?: Date }): Promise<string> {
  const now = input.now ?? new Date();
  const [state, verifier] = String(input.cookie ?? "").split(".");
  const given = Buffer.from(String(input.state ?? ""));
  if (!state || !verifier || given.length !== Buffer.byteLength(state) || !timingSafeEqual(given, Buffer.from(state))) throw new BookingError("Prijava je istekla. Pokušajte ponovo.", 400);
  const response = await (input.fetcher ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code, client_id: input.config.clientId, client_secret: input.config.clientSecret,
      redirect_uri: `${input.origin}/api/auth/google/callback`, grant_type: "authorization_code", code_verifier: verifier,
    }),
  });
  const tokens = await response.json() as { id_token?: string };
  if (!response.ok || !tokens.id_token) throw new BookingError("Google prijava nije uspjela.", 400);
  const claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  const { email, name } = checkGoogleClaims(claims, input.config.clientId, now);
  return createSession(db, await findOrCreateClientByEmail(db, email, name, now), now);
}

// --- Cookies and request checks, kept framework-free so they can be unit tested ---

export function readCookie(request: Request, name: string): string {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function cookieHeader(request: Request, name: string, value: string, maxAgeSeconds: number, path = "/"): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function sessionCookie(request: Request, token: string): string {
  return cookieHeader(request, SESSION_COOKIE, token, SESSION_SECONDS);
}

// SameSite=Lax already keeps the session cookie off cross-site POSTs; this Origin check is a second lock.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}
