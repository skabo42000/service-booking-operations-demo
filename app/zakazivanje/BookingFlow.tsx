"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { CATEGORIES, INSTAGRAM_URL } from "../site";
import LoginPanel, { ProfileForm, type Account } from "../components/LoginPanel";

type Service = { id: string; category: string; name: string; durationMinutes: number; priceFening: number | null };

function price(fening: number | null) {
  return fening === null ? "cijena još nije potvrđena" : `${Math.floor(fening / 100)},${String(fening % 100).padStart(2, "0")} KM`;
}
type Staff = { id: string; name: string; bio: string; serviceIds: string[]; shifts: { weekday: number; start: string; end: string }[] };
type Booking = { id: string; serviceId: string; staffId: string; date: string; time: string; endTime: string; clientName: string; status: string };

function sarajevoDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sarajevo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("sr-Latn-BA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

async function fetchSlots(serviceId: string, staffId: string, date: string, signal?: AbortSignal): Promise<string[]> {
  const query = new URLSearchParams({ serviceId, staffId, date });
  const response = await fetch(`/api/availability?${query}`, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body.slots;
}

function makeCalendarFile(booking: Booking, serviceName: string, staffName: string) {
  const stamp = booking.date.replaceAll("-", "");
  const start = booking.time.replace(":", "");
  const end = booking.endTime.replace(":", "");
  const summary = `DEMO termin - ${serviceName}`.replace(/[\\,;]/g, " ");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Princess Demo//SR", "BEGIN:VEVENT", `UID:${booking.id}@princess-demo.local`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`, `DTSTART;TZID=Europe/Sarajevo:${stamp}T${start}00`, `DTEND;TZID=Europe/Sarajevo:${stamp}T${end}00`, `SUMMARY:${summary}`, `DESCRIPTION:Probni termin kod ${staffName}. Ne važi kao rezervacija u salonu.`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = "princess-demo-termin.ics"; link.click(); URL.revokeObjectURL(url);
}

export default function BookingFlow({ initialCategory, googleEnabled }: { initialCategory?: string; googleEnabled: boolean }) {
  const [catalog, setCatalog] = useState<{ services: Service[]; staff: Staff[] } | null>(null);
  const [category, setCategory] = useState(initialCategory ?? "");
  const [chosenService, setChosenService] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [me, setMe] = useState<Account | null | undefined>(undefined);
  const [confirmation, setConfirmation] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const today = useMemo(() => sarajevoDate(), []);
  const maxDate = useMemo(() => addDays(today, 21), [today]);
  // A category with one service selects it directly; with more, the visitor picks one.
  const categoryServices = catalog?.services.filter((item) => item.category === category) ?? [];
  const serviceId = categoryServices.length === 1 ? categoryServices[0].id : categoryServices.some((item) => item.id === chosenService) ? chosenService : "";
  const service = catalog?.services.find((item) => item.id === serviceId);
  const categoryIs = (id: string) => category === id;
  const bookableCategory = CATEGORIES.find((item) => item.id === category)?.bookable === true;
  const availableStaff = catalog?.staff.filter((person) => person.serviceIds.includes(serviceId)) ?? [];
  const person = catalog?.staff.find((item) => item.id === staffId);

  useEffect(() => {
    fetch("/api/catalog", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Kalendar trenutno nije dostupan.");
      return response.json();
    }).then(setCatalog).catch(() => setError("Kalendar trenutno nije dostupan. Pokušajte ponovo kasnije."));
    fetch("/api/me", { cache: "no-store" }).then(async (response) => setMe(response.ok ? (await response.json()).account : null)).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    const controller = new AbortController();
    fetchSlots(serviceId, staffId, date, controller.signal)
      .then((found) => { setSlots(found); setLoading(false); })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Termini nisu dostupni.");
        setSlots([]); setLoading(false);
      });
    return () => controller.abort();
  }, [serviceId, staffId, date]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acknowledged) { setError("Potvrdite da razumijete da je ovo demo termin."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, staffId, date, time }) });
      const body = await response.json();
      if (response.status === 401) setMe(null);
      if (!response.ok) throw new Error(body.error);
      setConfirmation(body.booking);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rezervacija nije uspjela.");
      setSlots(await fetchSlots(serviceId, staffId, date).catch(() => []));
      setTime("");
    } finally { setLoading(false); }
  }

  if (confirmation) return <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-luxury-gold/35 bg-white p-8 text-center shadow-sm md:p-12" role="status">
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-luxury-sand text-luxury-gold-ink"><Check size={30} /></div>
    <p className="mt-6 font-script text-4xl text-luxury-gold-ink">Termin je zabilježen</p>
    <h2 className="mt-1 font-serif text-5xl">Demo potvrda</h2>
    <p className="mt-4 leading-7 text-luxury-charcoal/70">Ovo je probna rezervacija. Salon neće dobiti obavještenje i termin nije važeći za posjetu.</p>
    <div className="mt-8 space-y-2 rounded-lg bg-[#F8F5F0] p-6 text-left text-sm leading-7"><p><strong>Usluga:</strong> {service?.name}</p><p><strong>Član tima:</strong> {person?.name}</p><p><strong>Datum:</strong> {formatDate(confirmation.date)}</p><p><strong>Vrijeme:</strong> {confirmation.time}–{confirmation.endTime}</p><p><strong>Šifra:</strong> {confirmation.id.slice(0, 8)}</p></div>
    <div className="mt-8 flex flex-wrap justify-center gap-3"><button type="button" onClick={() => makeCalendarFile(confirmation, service?.name ?? "Usluga", person?.name ?? "Član tima")} className="rounded-lg bg-luxury-gold px-6 py-3 text-sm font-semibold">Sačuvajte u kalendar</button><Link href="/moji-termini" className="rounded-lg border border-luxury-champagne px-6 py-3 text-sm">Moji termini</Link></div>
  </div>;

  return <div className="mx-auto mt-12 grid max-w-6xl gap-8 lg:grid-cols-[1.5fr_.7fr]">
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-6 shadow-sm md:p-9"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-luxury-gold text-sm font-semibold">1</span><h2 className="font-serif text-3xl">Odaberite uslugu</h2></div><div className="mt-7 grid gap-3 sm:grid-cols-2">{CATEGORIES.map((category) => <button type="button" key={category.id} onClick={() => { setCategory(category.id); setChosenService(""); setStaffId(""); setDate(""); setTime(""); setSlots([]); }} className={`rounded-lg border p-5 text-left transition ${categoryIs(category.id) ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne/80 hover:border-luxury-gold"}`} aria-pressed={categoryIs(category.id)}><span className="block font-serif text-2xl">{category.name}</span><span className="mt-1 block text-xs leading-5 text-luxury-charcoal/60">{category.bookable ? "Demo zakazivanje" : "Bez zakazivanja"}</span></button>)}</div>{category === "solarijum" && <div className="mt-6 flex gap-3 rounded-lg bg-luxury-sand p-5"><Sun className="mt-1 shrink-0 text-luxury-gold-ink" size={22} /><div><p className="font-semibold">Za solarijum nije potrebno zakazivanje.</p><p className="mt-1 text-sm leading-6 text-luxury-charcoal/70">Dodatne informacije potražite na zvaničnom <a className="underline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram profilu</a>.</p></div></div>}{catalog && bookableCategory && categoryServices.length === 0 && <p className="mt-6 text-sm text-luxury-charcoal/60">Za ovu kategoriju trenutno nema usluga za online zakazivanje.</p>}
        {bookableCategory && categoryServices.length > 1 && <div className="mt-6 space-y-2"><p className="text-sm font-semibold">Koja usluga?</p>{categoryServices.map((item) => <button key={item.id} type="button" onClick={() => { setChosenService(item.id); setStaffId(""); setDate(""); setTime(""); setSlots([]); }} aria-pressed={serviceId === item.id} className={`flex w-full flex-wrap justify-between gap-2 rounded-lg border p-4 text-left text-sm transition ${serviceId === item.id ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne hover:border-luxury-gold"}`}><span className="font-semibold">{item.name}</span><span className="text-luxury-charcoal/60">{item.durationMinutes} min · {price(item.priceFening)}</span></button>)}</div>}
        {service && <p className="mt-5 text-sm text-luxury-charcoal/60">{service.name}: {service.durationMinutes} min · {price(service.priceFening)}. Trajanje u demo kalendaru biće potvrđeno sa salonom.</p>}</section>

      {service && <section className="rounded-xl bg-white p-6 shadow-sm md:p-9"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-luxury-gold text-sm font-semibold">2</span><h2 className="font-serif text-3xl">Izaberite člana tima</h2></div><div className="mt-7 grid gap-3 sm:grid-cols-2">{availableStaff.map((member) => <button type="button" key={member.id} onClick={() => { setStaffId(member.id); setTime(""); setSlots([]); if (date) setLoading(true); }} className={`rounded-lg border p-5 text-left transition ${staffId === member.id ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne/80 hover:border-luxury-gold"}`} aria-pressed={staffId === member.id}><UserRound className="mb-4 text-luxury-gold-ink" size={22} strokeWidth={1.4} /><span className="block font-serif text-2xl">{member.name}</span><span className="mt-1 block text-xs text-luxury-charcoal/60">{member.bio}</span><span className="mt-3 block text-xs font-semibold uppercase tracking-[.1em] text-luxury-gold-ink">Pogledajte raspored <ArrowRight className="inline" size={14} /></span></button>)}</div></section>}

      {service && staffId && <section className="rounded-xl bg-white p-6 shadow-sm md:p-9"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-luxury-gold text-sm font-semibold">3</span><h2 className="font-serif text-3xl">Datum i vrijeme</h2></div><p className="mt-5 text-sm text-luxury-charcoal/65">Raspored je proban i prikazuje naredne tri sedmice po vremenu u Banjoj Luci.</p><label className="mt-6 block text-sm font-semibold" htmlFor="datum">Izaberite datum</label><input id="datum" type="date" min={today} max={maxDate} value={date} onChange={(event) => { setDate(event.target.value); setTime(""); setSlots([]); setLoading(true); }} className="mt-2 w-full rounded-lg border border-luxury-champagne p-3 sm:w-auto" />{date && <><p className="mt-7 text-sm font-semibold">Slobodni termini za {formatDate(date)}</p><div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-lg border px-2 py-3 text-sm transition ${time === slot ? "border-luxury-gold bg-luxury-gold font-semibold" : "border-luxury-champagne hover:border-luxury-gold"}`}>{slot}</button>)}</div>{!loading && slots.length === 0 && <p className="mt-4 text-sm text-luxury-charcoal/60">Nema slobodnih termina za taj dan. Odaberite drugi datum.</p>}</>}</section>}

      {service && staffId && date && time && <section className="rounded-xl bg-white p-6 shadow-sm md:p-9"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-luxury-gold text-sm font-semibold">4</span><h2 className="font-serif text-3xl">Potvrdite demo termin</h2></div>
        {me === undefined && <p className="mt-7 text-sm text-luxury-charcoal/60">Provjera prijave…</p>}
        {me === null && <div className="mt-7"><p className="mb-5 text-sm leading-6 text-luxury-charcoal/70">Za potvrdu termina prijavite se. Tako termine kasnije vidite i otkazujete u „Moji termini“, a kalendar je zaštićen od lažnih rezervacija.</p><LoginPanel googleEnabled={googleEnabled} next={`/zakazivanje?usluga=${category}`} onSignedIn={setMe} /></div>}
        {me && !me.name && <div className="mt-7"><ProfileForm account={me} onSaved={setMe} submitLabel="Nastavi" /></div>}
        {me?.blocked && <p className="mt-7 rounded-lg bg-luxury-sand p-4 text-sm">Online zakazivanje nije dostupno za ovaj nalog. Pozovite salon.</p>}
        {me && me.name && !me.blocked && <form onSubmit={submit} className="mt-7"><p className="text-sm">Termin na ime: <strong>{me.name}</strong> <Link href="/moji-termini" className="ml-2 text-xs underline">promijeni</Link></p><label className="mt-6 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required className="mt-1 accent-[#C5A059]" /><span>Razumijem da je ovo demo i da termin nije potvrđen u salonu.</span></label><button type="submit" disabled={loading} className="mt-7 w-full rounded-lg bg-luxury-gold px-6 py-4 text-sm font-semibold uppercase tracking-[.12em] disabled:opacity-50">{loading ? "Provjera termina…" : "Potvrdite demo termin"}</button></form>}</section>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    </div>
    <aside className="h-fit rounded-xl border border-luxury-champagne/60 bg-luxury-bg p-7 lg:sticky lg:top-28"><p className="font-script text-3xl text-luxury-gold-ink">Vaš izbor</p><h2 className="font-serif text-3xl">Pregled termina</h2><div className="mt-7 space-y-5 border-t border-luxury-champagne pt-6 text-sm"><p className="flex items-center gap-3"><ArrowLeft size={17} className="text-luxury-gold-ink" /> {service?.name ?? "Odaberite uslugu"}</p><p className="flex items-center gap-3"><UserRound size={17} className="text-luxury-gold-ink" /> {person?.name ?? "Odaberite člana tima"}</p><p className="flex items-center gap-3"><CalendarDays size={17} className="text-luxury-gold-ink" /> {date ? formatDate(date) : "Odaberite datum"}</p><p className="flex items-center gap-3"><Clock size={17} className="text-luxury-gold-ink" /> {time || "Odaberite vrijeme"}</p></div><p className="mt-7 border-t border-luxury-champagne pt-6 text-xs leading-6 text-luxury-charcoal/60">Cijena se prikazuje samo kada je salon potvrdi. Ovaj kalendar koristi probne rasporede i trajanja.</p></aside>
  </div>;
}
