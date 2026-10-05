"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LoginPanel, { ProfileForm, sendJson, type Account } from "../components/LoginPanel";

type MyBooking = { id: string; date: string; time: string; endTime: string; status: string; serviceId: string; serviceName: string; staffId: string; staffName: string; canChange: boolean };
type Person = { id: string; name: string; serviceIds: string[] };

const STATUS: Record<string, string> = { confirmed: "Zakazano", arrived: "Završeno", no_show: "Propušteno", cancelled: "Otkazano" };
const card = "rounded-xl bg-white p-6 shadow-sm md:p-8";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("sr-Latn-BA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function todayInBanjaLuka() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sarajevo" }).format(new Date());
}

function ChangeBooking({ booking, staff, onDone, onClose }: { booking: MyBooking; staff: Person[]; onDone: (message: string) => void; onClose: () => void }) {
  const capable = staff.filter((person) => person.serviceIds.includes(booking.serviceId));
  const [staffId, setStaffId] = useState(booking.staffId);
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; slots: string[]; error: string }>({ key: "", slots: [], error: "" });
  const [error, setError] = useState("");
  const today = todayInBanjaLuka();
  const max = new Date(Date.parse(`${today}T12:00:00Z`) + 21 * 86_400_000).toISOString().slice(0, 10);
  const key = `${staffId}-${date}`;

  useEffect(() => {
    if (!date) return;
    let active = true;
    sendJson<{ slots: string[] }>(`/api/me/bookings/${booking.id}/availability?${new URLSearchParams({ staffId, date })}`, "GET")
      .then((data) => { if (active) setLoaded({ key, slots: data.slots, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ key, slots: [], error: caught instanceof Error ? caught.message : "Termini nisu dostupni." }); });
    return () => { active = false; };
  }, [booking.id, staffId, date, key]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try { await sendJson(`/api/me/bookings/${booking.id}`, "PATCH", { staffId, date, time }); onDone("Termin je promijenjen."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Promjena nije uspjela."); setTime(""); }
  }

  return <form onSubmit={save} className="mt-5 space-y-4 border-t border-luxury-champagne pt-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Član tima<select value={staffId} onChange={(event) => { setStaffId(event.target.value); setTime(""); }} className="mt-2 w-full rounded-lg border border-luxury-champagne p-3 font-normal">{capable.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Datum<input type="date" value={date} min={today} max={max} onChange={(event) => { setDate(event.target.value); setTime(""); }} required className="mt-2 w-full rounded-lg border border-luxury-champagne p-3 font-normal" /></label>
    </div>
    {loaded.key !== key ? <p className="text-sm text-luxury-charcoal/60">Učitavanje slobodnih termina…</p>
      : loaded.error ? <p className="text-sm text-red-800">{loaded.error}</p>
      : loaded.slots.length === 0 ? <p className="text-sm text-luxury-charcoal/60">Nema slobodnih termina za taj dan.</p>
      : <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{loaded.slots.map((slot) => <button key={slot} type="button" onClick={() => setTime(slot)} aria-pressed={time === slot} className={`rounded-lg border px-2 py-2 text-sm ${time === slot ? "border-luxury-gold bg-luxury-gold font-semibold" : "border-luxury-champagne hover:border-luxury-gold"}`}>{slot}</button>)}</div>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={!time} className="rounded-lg bg-luxury-gold px-5 py-3 text-sm font-semibold disabled:opacity-50">{time ? `Promijeni na ${time}` : "Odaberite vrijeme"}</button><button type="button" onClick={onClose} className="rounded-lg border border-luxury-champagne px-5 py-3 text-sm">Odustani</button></div>
  </form>;
}

export default function MyAccount({ googleEnabled, googleError }: { googleEnabled: boolean; googleError: boolean }) {
  const [state, setState] = useState<{ loaded: boolean; account: Account | null; bookings: MyBooking[] }>({ loaded: false, account: null, bookings: [] });
  const [staff, setStaff] = useState<Person[]>([]);
  const [changing, setChanging] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(googleError ? "Google prijava nije uspjela. Pokušajte ponovo ili se prijavite kodom na email." : "");

  const load = useCallback(async () => {
    try {
      const data = await sendJson<{ account: Account; bookings: MyBooking[] }>("/api/me", "GET");
      setState({ loaded: true, account: data.account, bookings: data.bookings });
    } catch { setState({ loaded: true, account: null, bookings: [] }); }
  }, []);

  useEffect(() => {
    let active = true;
    sendJson<{ account: Account; bookings: MyBooking[] }>("/api/me", "GET")
      .then((data) => { if (active) setState({ loaded: true, account: data.account, bookings: data.bookings }); })
      .catch(() => { if (active) setState({ loaded: true, account: null, bookings: [] }); });
    fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setStaff(data.staff); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function act(action: () => Promise<unknown>, message: string) {
    setError(""); setNotice("");
    try { await action(); setNotice(message); setChanging(null); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Izmjena nije uspjela."); }
  }

  const { loaded, account, bookings } = state;
  const alerts = <>{notice && <p role="status" className="rounded-lg border border-luxury-gold/50 bg-white p-4 text-sm">{notice}</p>}{error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}</>;
  if (!loaded) return <p className="mx-auto mt-10 max-w-4xl text-sm text-luxury-charcoal/60">Učitavanje…</p>;
  if (!account) return <div className="mx-auto mt-10 max-w-md space-y-5">{alerts}<section className={card}><h2 className="font-serif text-3xl">Prijava</h2><p className="mb-6 mt-2 text-sm leading-6 text-luxury-charcoal/65">Prijavite se da vidite, promijenite ili otkažete svoje termine.</p><LoginPanel googleEnabled={googleEnabled} next="/moji-termini" onSignedIn={() => { setError(""); void load(); }} /></section></div>;

  const upcoming = bookings.filter((booking) => booking.canChange).reverse();
  const other = bookings.filter((booking) => !booking.canChange);
  return <div className="mx-auto mt-10 max-w-4xl space-y-6">
    {alerts}
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-serif text-3xl">{account.name || "Dobro došli"}</h2><p className="mt-1 text-sm text-luxury-charcoal/60">{[account.email, account.phone].filter(Boolean).join(" · ")}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditing(!editing)} className="rounded-lg border border-luxury-champagne px-4 py-2 text-sm">Uredi profil</button><button type="button" onClick={() => void act(() => sendJson("/api/auth/logout", "POST", {}), "Odjavljeni ste.")} className="rounded-lg border border-luxury-champagne px-4 py-2 text-sm">Odjava</button></div>
      </div>
      {account.blocked && <p className="mt-5 rounded-lg bg-luxury-sand p-4 text-sm">Online zakazivanje nije dostupno za ovaj nalog. Za termin pozovite salon.</p>}
      {(editing || !account.name) && <div className="mt-6 max-w-md border-t border-luxury-champagne pt-6"><ProfileForm key={`${account.name}-${account.phone}`} account={account} onSaved={() => { setEditing(false); setNotice("Profil je sačuvan."); void load(); }} /></div>}
    </section>
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-3xl">Zakazani termini</h2>{!account.blocked && <Link href="/zakazivanje" className="rounded-lg bg-luxury-gold px-5 py-3 text-sm font-semibold">Novi termin</Link>}</div>
      {upcoming.length === 0 ? <p className="mt-4 text-sm text-luxury-charcoal/60">Nemate zakazanih termina.</p> : <ul className="mt-5 space-y-3">{upcoming.map((booking) => <li key={booking.id} className="rounded-lg border border-luxury-gold/50 p-5">
        <p className="font-serif text-2xl">{booking.time}–{booking.endTime} · {booking.serviceName}</p>
        <p className="mt-1 text-sm capitalize text-luxury-charcoal/70">{formatDate(booking.date)} · {booking.staffName}</p>
        {changing === booking.id ? <ChangeBooking booking={booking} staff={staff} onDone={(message) => void act(async () => undefined, message)} onClose={() => setChanging(null)} />
          : <div className="mt-4 flex flex-wrap gap-2">{!account.blocked && <button type="button" onClick={() => setChanging(booking.id)} className="rounded-lg border border-luxury-champagne px-4 py-2 text-sm">Promijeni termin</button>}<button type="button" onClick={() => { if (window.confirm("Otkazati ovaj termin?")) void act(() => sendJson(`/api/me/bookings/${booking.id}`, "DELETE"), "Termin je otkazan."); }} className="rounded-lg border border-luxury-champagne px-4 py-2 text-sm">Otkaži</button></div>}
      </li>)}</ul>}
      <p className="mt-5 text-xs text-luxury-charcoal/55">Pravila otkazivanja salon još nije potvrdio. U demu možete otkazati do početka termina.</p>
    </section>
    {other.length > 0 && <section className={card}><h2 className="font-serif text-3xl">Istorija</h2><ul className="mt-4 space-y-2 text-sm">{other.map((booking) => <li key={booking.id} className="flex flex-wrap justify-between gap-2 border-b border-luxury-champagne/60 pb-2"><span>{booking.date} {booking.time} · {booking.serviceName} · {booking.staffName}</span><span>{STATUS[booking.status] ?? booking.status}</span></li>)}</ul></section>}
    <section className="rounded-xl border border-red-200 p-6 text-sm"><h2 className="font-serif text-2xl">Brisanje naloga</h2><p className="mt-2 text-luxury-charcoal/70">Brišu se ime, telefon i email, a budući termini se otkazuju. Salon zadržava samo anonimnu evidenciju posjeta i naplate.</p><button type="button" onClick={() => { if (window.confirm("Trajno obrisati nalog i lične podatke?")) void act(() => sendJson("/api/me", "DELETE"), "Nalog je obrisan."); }} className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-red-800">Obriši nalog</button></section>
  </div>;
}
