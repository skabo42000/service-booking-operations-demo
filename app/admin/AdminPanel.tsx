"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChartColumn, Clock, Contact, ExternalLink, LogOut, Plus, Scissors, UserRound, Users } from "lucide-react";
import { BookingCard, NewBookingForm, STATUS_LABELS, type Booking, type Catalog, type Person } from "./BookingTools";
import Clients from "./Clients";
import Reports from "./Reports";
import Services from "./Services";
import Team from "./Team";
import { ADMIN_SECTIONS, type AdminTab } from "./sections";

type Block = { id: string; staffId: string; staffName: string; start: string; end: string; note: string };
type Day = { bookings: Booking[]; blocks: Block[] };
type StaffUser = { id: string; name: string; email: string; role: "owner" | "staff"; staffId: string | null };
const ICONS: Record<AdminTab, typeof CalendarDays> = { calendar: CalendarDays, clients: Contact, team: Users, services: Scissors, shifts: Clock, reports: ChartColumn, mine: UserRound };

// Always visible in the staff area: who is signed in, the way out, and the public site in a new tab.
function StaffTopBar({ user, onSignOut }: { user: StaffUser | null; onSignOut: () => void }) {
  return <header className="sticky top-0 z-40 bg-luxury-charcoal text-white">
    <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
      <Link href="/admin" className="flex items-baseline gap-3"><span className="font-serif text-2xl leading-none">Princess</span><span className="text-[10px] uppercase tracking-[.25em] text-luxury-gold">Osoblje · demo</span></Link>
      <div className="flex items-center gap-4 text-sm">
        {user && <span className="hidden text-white/80 sm:inline">{user.name} <span className="text-white/50">({ROLE_LABELS[user.role]})</span></span>}
        <a href="/" target="_blank" rel="noopener" className="flex items-center gap-1 text-white/80 hover:text-white">Javni sajt <ExternalLink size={14} /></a>
        {user && <button type="button" onClick={onSignOut} className="flex items-center gap-1 text-white/80 hover:text-white"><LogOut size={15} /> Odjava</button>}
      </div>
    </div>
  </header>;
}

const dayNames = ["Nedjelja", "Ponedjeljak", "Utorak", "Srijeda", "Četvrtak", "Petak", "Subota"];
const ROLE_LABELS = { owner: "vlasnica", staff: "član tima" };

function sarajevoDate() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Sarajevo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function ShiftRow({ person, weekday, onSave }: { person: Person; weekday: number; onSave: (input: { staffId: string; weekday: number; start: string | null; end: string | null }) => Promise<unknown> }) {
  const existing = person.shifts.find((item) => item.weekday === weekday);
  const [start, setStart] = useState(existing?.start ?? "10:00");
  const [end, setEnd] = useState(existing?.end ?? "18:00");
  return <div className="grid items-center gap-3 border-b border-luxury-champagne/60 py-4 sm:grid-cols-[1fr_auto_auto_auto]">
    <span className="text-sm font-semibold">{dayNames[weekday]} <span className="ml-2 text-xs font-normal text-luxury-charcoal/50">{existing ? `${existing.start}–${existing.end}` : "Neradni dan"}</span></span>
    <div className="flex items-center gap-2"><input aria-label={`${dayNames[weekday]} početak`} type="time" value={start} onChange={(event) => setStart(event.target.value)} className="w-28 rounded border border-luxury-champagne p-2 text-sm" /><span>–</span><input aria-label={`${dayNames[weekday]} kraj`} type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="w-28 rounded border border-luxury-champagne p-2 text-sm" /></div>
    <button type="button" onClick={() => onSave({ staffId: person.id, weekday, start, end })} className="rounded bg-luxury-gold px-4 py-2 text-xs font-semibold">Sačuvaj</button>
    <button type="button" onClick={() => onSave({ staffId: person.id, weekday, start: null, end: null })} className="rounded border border-luxury-champagne px-4 py-2 text-xs">Neradni dan</button>
  </div>;
}

function ProfileEditor({ person, onSave }: { person: Person; onSave: (id: string, name: string, bio: string) => Promise<unknown> }) {
  const [name, setName] = useState(person.name);
  const [bio, setBio] = useState(person.bio);
  return <form onSubmit={(event) => { event.preventDefault(); void onSave(person.id, name, bio); }} className="rounded-xl border border-luxury-champagne bg-white p-6">
    <p className="mb-5 text-xs uppercase tracking-[.15em] text-luxury-gold-ink">Moj javni profil</p>
    <label className="block text-sm font-semibold" htmlFor={`name-${person.id}`}>Ime</label><input id={`name-${person.id}`} value={name} minLength={2} maxLength={60} required onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded border border-luxury-champagne p-3" />
    <label className="mt-5 block text-sm font-semibold" htmlFor={`bio-${person.id}`}>Kratak opis</label><textarea id={`bio-${person.id}`} value={bio} maxLength={240} required onChange={(event) => setBio(event.target.value)} className="mt-2 min-h-28 w-full rounded border border-luxury-champagne p-3" />
    <button type="submit" className="mt-5 rounded bg-luxury-gold px-5 py-3 text-xs font-semibold uppercase tracking-[.1em]">Sačuvaj profil</button>
  </form>;
}

function StaffLogin({ onSignedIn }: { onSignedIn: (user: StaffUser) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; role: "owner" | "staff" }[]>([]);
  const [userId, setUserId] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/staff/login", { cache: "no-store" }).then((response) => response.json())
      .then((data) => { setUsers(data.users ?? []); setUserId(data.users?.[0]?.id ?? ""); })
      .catch(() => setError("Lista osoblja nije dostupna."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff/login", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Prijava nije uspjela.");
      setKey(""); onSignedIn(data.user);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Prijava nije uspjela."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mx-auto mt-10 max-w-md rounded-xl bg-white p-8 shadow-sm">
    <h2 className="font-serif text-3xl">Prijava osoblja</h2>
    <p className="mt-3 text-sm leading-6 text-luxury-charcoal/65">Demo ulaz: izaberite ko se prijavljuje i upišite demo lozinku. Vlasnica vidi cijeli salon, a član tima samo svoj raspored i svoje termine.</p>
    <fieldset className="mt-6 space-y-2"><legend className="text-sm font-semibold">Prijavljujem se kao</legend>{users.map((user) =>
      <label key={user.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${userId === user.id ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne"}`}>
        <span className="flex items-center gap-3"><input type="radio" name="staff-user" value={user.id} checked={userId === user.id} onChange={() => setUserId(user.id)} className="accent-[#C5A059]" />{user.name}</span>
        <span className="text-xs text-luxury-charcoal/55">{ROLE_LABELS[user.role]}</span>
      </label>)}</fieldset>
    <label htmlFor="admin-key" className="mt-5 block text-sm font-semibold">Demo lozinka</label>
    <input id="admin-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required className="mt-2 w-full rounded-lg border border-luxury-champagne p-3" />
    <p className="mt-2 text-xs text-luxury-charcoal/55">U pravoj verziji svako osoblje dobija svoj nalog i kod za prijavu na email.</p>
    <button type="submit" disabled={busy || !userId} className="mt-5 w-full rounded-lg bg-luxury-gold p-3 text-sm font-semibold disabled:opacity-50">{busy ? "Prijava…" : "Prijavi se"}</button>
    {error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
  </form>;
}

export default function AdminPanel() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const router = useRouter();
  const slug = usePathname().split("/")[2] ?? "";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [day, setDay] = useState<Day>({ bookings: [], blocks: [] });
  const [date, setDate] = useState(sarajevoDate);
  const [today] = useState(sarajevoDate);
  const [adding, setAdding] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("tim-1");
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockNote, setBlockNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const adminRequest = useCallback(async (path: string, method = "GET", body?: unknown): Promise<unknown> => {
    const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (response.status === 401) setUser(null);
    if (!response.ok) throw new Error(data.error ?? "Zahtjev nije uspio.");
    return data;
  }, []);

  const refreshCatalog = useCallback(async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (response.ok) setCatalog(await response.json());
  }, []);

  const loadDay = useCallback(async (selectedDate: string) => {
    setDay(await adminRequest(`/api/admin/calendar?date=${encodeURIComponent(selectedDate)}`) as Day);
  }, [adminRequest]);

  useEffect(() => {
    let active = true;
    fetch("/api/staff/me", { cache: "no-store" }).then(async (response) => { if (active) setUser(response.ok ? (await response.json()).user : null); }).catch(() => { if (active) setUser(null); });
    fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json()).then((data) => { if (active) setCatalog(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetch(`/api/admin/calendar?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!active) return;
        if (response.status === 401) setUser(null);
        else if (!response.ok) setError(data.error ?? "Kalendar nije dostupan.");
        else setDay(data as Day);
      })
      .catch(() => { if (active) setError("Kalendar nije dostupan."); });
    return () => { active = false; };
  }, [user, date]);

  const downloadFile = useCallback(async (path: string, filename: string) => {
    setError("");
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) { setError((await response.json()).error ?? "Preuzimanje nije uspjelo."); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }, []);

  // A team member only gets her own column and her own services in every form.
  const myCatalog = useMemo<Catalog | null>(() => {
    if (!catalog || !user) return null;
    if (user.role === "owner") return catalog;
    const me = catalog.staff.filter((person) => person.id === user.staffId);
    return { staff: me, services: catalog.services.filter((service) => me[0]?.serviceIds.includes(service.id)) };
  }, [catalog, user]);
  const me = catalog?.staff.find((person) => person.id === user?.staffId);

  async function mutate(path: string, method: string, body?: unknown, message = "Izmjena je sačuvana."): Promise<boolean> {
    setError(""); setNotice("");
    try { await adminRequest(path, method, body); await Promise.all([loadDay(date), refreshCatalog()]); setNotice(message); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Izmjena nije uspjela."); return false; }
  }

  async function signOut() {
    await fetch("/api/staff/logout", { method: "POST" }).catch(() => undefined);
    setUser(null); setDay({ bookings: [], blocks: [] }); setNotice(""); setError(""); router.push("/admin");
  }

  if (user === undefined) return <><StaffTopBar user={null} onSignOut={() => undefined} /><p className="mx-auto mt-12 max-w-md px-4 text-sm text-luxury-charcoal/60">Učitavanje…</p></>;
  if (user === null) return <><StaffTopBar user={null} onSignOut={() => undefined} /><div className="px-4 pb-16"><StaffLogin onSignedIn={(signedIn) => { setUser(signedIn); setError(""); }} /></div></>;

  const owner = user.role === "owner";
  const sections = ADMIN_SECTIONS.filter((section) => owner ? !section.staffOnly : !section.ownerOnly);
  // The URL decides the section; a team member who opens an owner-only address simply sees her calendar.
  const tab: AdminTab = sections.find((section) => section.slug === slug)?.tab ?? "calendar";
  const counts = Object.keys(STATUS_LABELS).map((status) => [status, day.bookings.filter((booking) => booking.status === status).length] as const);

  return <>
    <StaffTopBar user={user} onSignOut={() => void signOut()} />
    <nav aria-label="Osoblje" className="sticky top-12 z-30 border-b border-luxury-champagne bg-[#F4F1EC]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 md:px-6">{sections.map((section) => { const Icon = ICONS[section.tab]; const active = tab === section.tab; return (
        <Link key={section.slug} href={`/admin/${section.slug}`} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm ${active ? "bg-luxury-charcoal text-white" : "bg-white hover:bg-luxury-sand"}`}><Icon size={17} /> {owner ? section.label : section.staffLabel}</Link>); })}</div>
    </nav>
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-6">
    {error && <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded border border-luxury-gold/50 bg-white p-4 text-sm">{notice}</p>}

    {tab === "calendar" && <div className={`mt-8 grid gap-7 ${owner ? "lg:grid-cols-[1.4fr_.8fr]" : ""}`}><section className="rounded-xl bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-serif text-3xl">{owner ? "Rezervacije" : "Moji termini"}</h2><div className="flex flex-wrap items-center gap-2"><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} className="rounded border border-luxury-champagne p-2" aria-label="Datum kalendara" /><button type="button" onClick={() => setAdding(true)} disabled={adding || !myCatalog?.staff.length} className="flex items-center gap-1 rounded bg-luxury-gold px-4 py-2 text-sm font-semibold disabled:opacity-50"><Plus size={16} /> Novi termin</button></div></div>
      <p className="mt-4 text-xs text-luxury-charcoal/60">{counts.map(([status, count]) => `${STATUS_LABELS[status]}: ${count}`).join(" · ")}</p>
      {adding && myCatalog && <NewBookingForm catalog={myCatalog} initialDate={date} request={adminRequest} onSave={(body) => mutate("/api/admin/bookings", "POST", body, "Termin je sačuvan.")} onClose={() => setAdding(false)} />}
      <div className="mt-7 space-y-3">{day.bookings.length === 0 && <p className="text-sm text-luxury-charcoal/60">Nema demo rezervacija za taj dan.</p>}{myCatalog && day.bookings.map((booking) => <BookingCard key={`${booking.id}-${booking.status}-${booking.date}-${booking.time}-${booking.staffId}`} booking={booking} today={today} catalog={myCatalog} request={adminRequest}
        onStatus={(status) => mutate(`/api/admin/bookings/${booking.id}`, "PATCH", { status }, "Status je sačuvan.")}
        onCancel={() => mutate(`/api/admin/bookings/${booking.id}`, "DELETE", undefined, "Termin je otkazan.")}
        onReschedule={(body) => mutate(`/api/admin/bookings/${booking.id}`, "PATCH", body, "Termin je premješten.")}
        onPay={(body) => mutate(`/api/admin/bookings/${booking.id}/payments`, "POST", body, "Naplata je evidentirana.")}
        onReverse={owner ? (paymentId) => mutate(`/api/admin/payments/${paymentId}/reverse`, "POST", undefined, "Naplata je stornirana.") : undefined} />)}</div>
      {!owner && day.blocks.length > 0 && <div className="mt-6 space-y-2 border-t border-luxury-champagne pt-5 text-sm"><p className="font-semibold">Moje pauze i odsustva</p>{day.blocks.map((block) => <p key={block.id}>{block.start}–{block.end}{block.note ? ` · ${block.note}` : ""}</p>)}</div>}
    </section>
    {owner && <section className="h-fit rounded-xl bg-white p-6 shadow-sm md:p-8"><h2 className="font-serif text-3xl">Odsustvo i pauze</h2><p className="mt-2 text-sm text-luxury-charcoal/60">Blokirani periodi više se ne nude klijentima.</p><div className="mt-5 space-y-2">{day.blocks.map((block) => <div key={block.id} className="flex items-center justify-between gap-3 rounded bg-[#F8F5F0] p-3 text-sm"><span>{block.start}–{block.end} · {block.staffName}{block.note ? ` · ${block.note}` : ""}</span><button type="button" onClick={() => void mutate(`/api/admin/blocks/${block.id}`, "DELETE")} className="underline">Ukloni</button></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void mutate("/api/admin/blocks", "POST", { staffId: selectedStaff, date, start: blockStart, end: blockEnd, note: blockNote }); }} className="mt-7 space-y-4 border-t border-luxury-champagne pt-6"><label className="block text-sm font-semibold">Član tima<select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="mt-2 w-full rounded border border-luxury-champagne p-3">{catalog?.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Od<input type="time" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} required className="mt-2 w-full rounded border border-luxury-champagne p-3" /></label><label className="block text-sm font-semibold">Do<input type="time" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} required className="mt-2 w-full rounded border border-luxury-champagne p-3" /></label></div><label className="block text-sm font-semibold">Razlog (opciono)<input value={blockNote} maxLength={120} onChange={(event) => setBlockNote(event.target.value)} className="mt-2 w-full rounded border border-luxury-champagne p-3" /></label><button type="submit" className="w-full rounded bg-luxury-gold p-3 text-sm font-semibold">Blokiraj vrijeme</button></form></section>}
    </div>}

    {owner && tab === "shifts" && <section className="mt-8 rounded-xl bg-white p-6 shadow-sm md:p-8"><h2 className="font-serif text-3xl">Sedmične smjene</h2><p className="mt-2 text-sm text-luxury-charcoal/60">Promjena smjene utiče na buduće slobodne termine. Postojeće rezervacije moraju ostati pokrivene.</p><label className="mt-6 block max-w-sm text-sm font-semibold">Član tima<select value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)} className="mt-2 w-full rounded border border-luxury-champagne p-3">{catalog?.staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="mt-5">{catalog?.staff.find((person) => person.id === selectedStaff) && dayNames.map((_, weekday) => { const person = catalog.staff.find((item) => item.id === selectedStaff)!; const shift = person.shifts.find((item) => item.weekday === weekday); return <ShiftRow key={`${person.id}-${weekday}-${shift?.start}-${shift?.end}`} person={person} weekday={weekday} onSave={(input) => mutate("/api/admin/shifts", "PUT", input)} />; })}</div></section>}

    {!owner && tab === "mine" && <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="h-fit rounded-xl bg-white p-6 shadow-sm md:p-8"><h2 className="font-serif text-3xl">Moje smjene</h2><p className="mt-2 text-sm text-luxury-charcoal/60">Smjene mijenja vlasnica.</p><ul className="mt-5 space-y-2 text-sm">{dayNames.map((name, weekday) => { const shift = me?.shifts.find((item) => item.weekday === weekday); return <li key={name} className="flex justify-between border-b border-luxury-champagne/60 pb-2"><span>{name}</span><span>{shift ? `${shift.start}–${shift.end}` : "Neradni dan"}</span></li>; })}</ul>
        <p className="mt-5 text-sm">Usluge: {myCatalog?.services.map((service) => service.name).join(", ") || "nijedna"}</p></section>
      {me && <ProfileEditor key={`${me.id}-${me.name}-${me.bio}`} person={me} onSave={(id, name, bio) => mutate(`/api/admin/staff/${id}`, "PATCH", { name, bio }, "Profil je sačuvan.")} />}
    </div>}
    {owner && tab === "team" && <Team request={adminRequest} onChanged={() => void refreshCatalog()} />}
    {owner && tab === "services" && <Services request={adminRequest} onChanged={() => void refreshCatalog()} />}
    {owner && tab === "clients" && <Clients request={adminRequest} />}
    {owner && tab === "reports" && <Reports request={adminRequest} download={downloadFile} initialDate={today} />}
    </div>
  </>;
}
