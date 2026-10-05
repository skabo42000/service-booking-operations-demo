import { noStore } from "../../../lib/http";

export const runtime = "nodejs";

const visits = new Map<string, { count: number; reset: number }>();

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return noStore({ error: "Pitanje nije ispravno." }, 400); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3 || question.length > 500) return noStore({ error: "Pitanje treba imati od 3 do 500 znakova." }, 400);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = visits.get(ip);
  if (current && current.reset > now && current.count >= 10) return noStore({ error: "Dostigli ste demo ograničenje pitanja. Pokušajte kasnije." }, 429);
  if (!current || current.reset <= now) visits.set(ip, { count: 1, reset: now + 60 * 60 * 1000 });
  else current.count += 1;
  const secret = process.env.ASSISTANT_API_KEY;
  if (!secret) return noStore({ error: "AI vodič trenutno nije dostupan." }, 503);
  try {
    const origin = process.env.ASSISTANT_BACKEND_URL || "http://127.0.0.1:8001";
    const response = await fetch(`${origin.replace(/\/$/, "")}/ask`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", "X-Assistant-Key": secret },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) return noStore({ error: response.status === 429 ? "Vodič trenutno odgovara na drugo pitanje. Pokušajte ponovo." : "AI vodič trenutno nije dostupan." }, response.status === 429 ? 429 : 502);
    const result = await response.json();
    if (typeof result.answer !== "string") throw new Error("Invalid assistant response");
    return noStore({ answer: result.answer });
  } catch {
    return noStore({ error: "AI vodič trenutno nije dostupan. Pokušajte ponovo kasnije." }, 502);
  }
}
