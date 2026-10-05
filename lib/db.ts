import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client, type InStatement } from "@libsql/client";

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, duration_min INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staff (id TEXT PRIMARY KEY, name TEXT NOT NULL, bio TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS staff_services (staff_id TEXT NOT NULL REFERENCES staff(id), service_id TEXT NOT NULL REFERENCES services(id), PRIMARY KEY (staff_id, service_id))",
  "CREATE TABLE IF NOT EXISTS shifts (staff_id TEXT NOT NULL REFERENCES staff(id), weekday INTEGER NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, PRIMARY KEY (staff_id, weekday))",
  "CREATE TABLE IF NOT EXISTS time_off (id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '')",
  "CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id), staff_id TEXT NOT NULL REFERENCES staff(id), date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, client_name TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')), created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (key, window_start))",
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_bookings_staff_date ON bookings(staff_id, date, status)",
  "CREATE INDEX IF NOT EXISTS idx_blocks_staff_date ON time_off(staff_id, date)",
];

const SERVICES = [
  ["nokti", "nokti", "Njega noktiju · demo", 60, 1],
  ["kosa", "kosa", "Uređivanje kose · demo", 60, 2],
  ["depilacija", "depilacija", "Depilacija · demo", 30, 3],
] as const;
const STAFF = [
  ["tim-1", "Član tima 1", "Demo profil za nokte i depilaciju.", 1],
  ["tim-2", "Član tima 2", "Demo profil za kosu i depilaciju.", 2],
] as const;
const SKILLS = [["tim-1", "nokti"], ["tim-1", "depilacija"], ["tim-2", "kosa"], ["tim-2", "depilacija"]] as const;
// Staff sign-ins: the owner has no public profile; each team member is linked to her profile in `staff`.
const STAFF_USERS = [
  ["osoblje-vlasnica", "Vlasnica (demo)", "vlasnica@princess-demo.example", "owner", null],
  ["osoblje-tim-1", "Član tima 1", "tim1@princess-demo.example", "staff", "tim-1"],
  ["osoblje-tim-2", "Član tima 2", "tim2@princess-demo.example", "staff", "tim-2"],
] as const;
const staffUserInsert = (guard: string) => `INSERT OR IGNORE INTO staff_users (id, name, email, role, staff_id, active, created_at)
  SELECT ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE ${guard}`;

// Every seed row is inserted only when `guard` holds, so a whole batch is a no-op for a second caller.
function seedStatements(guard: string, guardArgs: string[]): InStatement[] {
  const statements: InStatement[] = [
    ...SERVICES.map((row) => ({ sql: `INSERT OR IGNORE INTO services (id, category, name, duration_min, active, sort_order) SELECT ?, ?, ?, ?, 1, ? WHERE ${guard}`, args: [...row, ...guardArgs] })),
    ...STAFF.map((row) => ({ sql: `INSERT OR IGNORE INTO staff (id, name, bio, active, sort_order) SELECT ?, ?, ?, 1, ? WHERE ${guard}`, args: [...row, ...guardArgs] })),
    ...SKILLS.map((row) => ({ sql: `INSERT OR IGNORE INTO staff_services (staff_id, service_id) SELECT ?, ? WHERE ${guard}`, args: [...row, ...guardArgs] })),
  ];
  for (const [person] of STAFF) for (let weekday = 1; weekday <= 6; weekday++)
    statements.push({ sql: `INSERT OR IGNORE INTO shifts (staff_id, weekday, start_min, end_min) SELECT ?, ?, ?, ? WHERE ${guard}`, args: [person, weekday, 10 * 60, weekday === 6 ? 16 * 60 : 18 * 60, ...guardArgs] });
  statements.push(...STAFF_USERS.map((row) => ({ sql: staffUserInsert(guard), args: [...row, ...guardArgs] })));
  return statements;
}

// SCHEMA is version 0; each migration runs once, in order, together with its version bump.
// Never rebuild a table that others reference (bookings, clients): add columns with ALTER TABLE instead.
const MIGRATIONS: string[][] = [
  [ // 1: visit statuses, booking source, phone and staff note
    `CREATE TABLE bookings_v1 (id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id), staff_id TEXT NOT NULL REFERENCES staff(id),
      date TEXT NOT NULL, start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, client_name TEXT NOT NULL, client_phone TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'online' CHECK(source IN ('online', 'phone', 'message', 'walk_in')), note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('confirmed', 'arrived', 'no_show', 'cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '')`,
    "INSERT INTO bookings_v1 (id, service_id, staff_id, date, start_min, end_min, client_name, status, created_at) SELECT id, service_id, staff_id, date, start_min, end_min, client_name, status, created_at FROM bookings",
    "DROP TABLE bookings",
    "ALTER TABLE bookings_v1 RENAME TO bookings",
    "CREATE INDEX IF NOT EXISTS idx_bookings_staff_date ON bookings(staff_id, date, status)",
  ],
  [ // 2: payment records; a reversal (storno) is a negative row pointing at the original, never an edit
    `CREATE TABLE payments (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id), amount_fening INTEGER NOT NULL CHECK(amount_fening <> 0),
      method TEXT NOT NULL CHECK(method IN ('cash', 'card', 'gift_card')), receipt_number TEXT NOT NULL DEFAULT '',
      reverses_id TEXT REFERENCES payments(id), paid_date TEXT NOT NULL, created_at TEXT NOT NULL)`,
    "CREATE UNIQUE INDEX idx_payments_reverses ON payments(reverses_id) WHERE reverses_id IS NOT NULL",
    "CREATE INDEX idx_payments_booking ON payments(booking_id)",
    "CREATE INDEX idx_payments_day ON payments(paid_date)",
  ],
  [ // 3: client records; phone_key is the phone in one international form, search_name is lowercase without diacritics
    `CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, search_name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', phone_key TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', blocked INTEGER NOT NULL DEFAULT 0, deleted_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT '')`,
    "CREATE UNIQUE INDEX idx_clients_phone ON clients(phone_key) WHERE phone_key <> ''",
    "CREATE UNIQUE INDEX idx_clients_email ON clients(email) WHERE email <> ''",
    "ALTER TABLE bookings ADD COLUMN client_id TEXT REFERENCES clients(id)",
    "CREATE INDEX idx_bookings_client ON bookings(client_id, status)",
  ],
  [ // 4: client accounts; only hashes of login codes and session tokens are stored
    "CREATE TABLE login_codes (id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL REFERENCES clients(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
    "CREATE INDEX idx_sessions_client ON sessions(client_id)",
  ],
  [ // 5: staff sign-ins with roles (owner / staff), their sessions, and an optional service price
    "ALTER TABLE services ADD COLUMN price_fening INTEGER",
    `CREATE TABLE staff_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', role TEXT NOT NULL CHECK(role IN ('owner', 'staff')),
      staff_id TEXT REFERENCES staff(id), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    "CREATE UNIQUE INDEX idx_staff_users_email ON staff_users(email) WHERE email <> ''",
    "CREATE UNIQUE INDEX idx_staff_users_staff ON staff_users(staff_id) WHERE staff_id IS NOT NULL",
    "CREATE TABLE staff_sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES staff_users(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
    // Databases seeded before this migration get their staff sign-ins here; fresh ones get them from the seed.
    ...STAFF_USERS.map(([id, name, email, role, staffId]) => `INSERT OR IGNORE INTO staff_users (id, name, email, role, staff_id, active, created_at)
      SELECT '${id}', '${name}', '${email}', '${role}', ${staffId ? `'${staffId}'` : "NULL"}, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE ${staffId ? `EXISTS (SELECT 1 FROM staff WHERE id = '${staffId}')` : "1"}`),
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function initialize(db: Client) {
  await db.batch(SCHEMA, "write");
  const storedVersion = async () => Number((await db.execute("SELECT value FROM meta WHERE key = 'schema_version'")).rows[0]?.value ?? 0);
  for (let version = await storedVersion(); version < MIGRATIONS.length; version++) {
    try {
      // The plain INSERT of `migration_N` fails if another server already ran this migration, rolling the batch back.
      await db.batch([
        { sql: "INSERT INTO meta (key, value) VALUES (?, ?)", args: [`migration_${version + 1}`, new Date().toISOString()] },
        ...MIGRATIONS[version],
        { sql: "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(version + 1)] },
      ], "write");
    } catch (error) {
      if (await storedVersion() <= version) throw error;
    }
  }
  const guard = "NOT EXISTS (SELECT 1 FROM meta WHERE key = 'seeded')";
  await db.batch([...seedStatements(guard, []), "INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')"], "write");
}

// Runs once per Banja Luka day: drops old rate-limit counters and, for the public demo, restores the seed data.
export async function dailyMaintenance(db: Client, day: string, resetDemo: boolean, now = new Date()): Promise<boolean> {
  const guard = "NOT EXISTS (SELECT 1 FROM meta WHERE key = 'demo_day' AND value = ?)";
  const statements: InStatement[] = [
    "SELECT value FROM meta WHERE key = 'demo_day'",
    { sql: "DELETE FROM rate_limits WHERE window_start < ?", args: [Math.floor(now.getTime() / 1000) - 86_400] },
    { sql: "DELETE FROM login_codes WHERE expires_at < ?", args: [Math.floor(now.getTime() / 1000)] },
    { sql: "DELETE FROM sessions WHERE expires_at < ?", args: [Math.floor(now.getTime() / 1000)] },
    { sql: "DELETE FROM staff_sessions WHERE expires_at < ?", args: [Math.floor(now.getTime() / 1000)] },
  ];
  if (resetDemo) {
    for (const table of ["payments", "sessions", "login_codes", "staff_sessions", "bookings", "clients", "time_off", "shifts", "staff_services", "staff_users", "staff", "services"])
      statements.push({ sql: `DELETE FROM ${table} WHERE ${guard}`, args: [day] });
    statements.push(...seedStatements(guard, [day]));
  }
  statements.push({ sql: "INSERT INTO meta (key, value) VALUES ('demo_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [day] });
  const [previous] = await db.batch(statements, "write");
  return previous.rows[0]?.value !== day;
}

export function banjaLukaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sarajevo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

let ready: Promise<Client> | undefined;
let maintainedDay = "";

async function connect(): Promise<Client> {
  const remote = process.env.TURSO_DATABASE_URL;
  let db: Client;
  if (remote) db = createClient({ url: remote, authToken: process.env.TURSO_AUTH_TOKEN });
  else {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    db = createClient({ url: "file:data/princess-demo.db" });
    await db.execute("PRAGMA busy_timeout = 5000");
  }
  await initialize(db);
  return db;
}

export async function getDb(): Promise<Client> {
  ready ??= connect().catch((error) => { ready = undefined; throw error; });
  const db = await ready;
  const day = banjaLukaDay();
  if (day !== maintainedDay) {
    await dailyMaintenance(db, day, process.env.DEMO_DAILY_RESET !== "off");
    maintainedDay = day;
  }
  return db;
}
