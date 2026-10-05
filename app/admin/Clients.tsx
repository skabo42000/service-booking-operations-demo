"use client";

import { FormEvent, useEffect, useState } from "react";
import { km, SOURCE_LABELS, STATUS_LABELS, type AdminRequest } from "./BookingTools";

export type ClientSummary = {
  id: string; name: string; phone: string; email: string; notes: string; blocked: boolean;
  visits: number; noShows: number; cancellations: number; upcoming: number; lastVisit: string | null; totalPaid: number;
};
type ClientDetail = ClientSummary & { deleted: boolean; history: { id: string; date: string; time: string; status: string; source: string; serviceName: string; staffName: string; paid: number }[] };

const input = "mt-2 w-full rounded border border-luxury-champagne p-3 text-sm font-normal";

function ClientForm({ client, request, onChanged, onDeleted }: { client: ClientDetail; request: AdminRequest; onChanged: (message: string) => void; onDeleted: () => void }) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [notes, setNotes] = useState(client.notes);
  const [blocked, setBlocked] = useState(client.blocked);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try { await request(`/api/admin/clients/${client.id}`, "PATCH", { name, phone, notes, blocked }); onChanged("Podaci klijenta su sačuvani."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Čuvanje nije uspjelo."); }
  }

  async function erase() {
    if (!window.confirm(`Obrisati lične podatke za ${client.name}? Budući termini se otkazuju, a evidencija posjeta i naplate ostaje bez imena.`)) return;
    try { await request(`/api/admin/clients/${client.id}`, "DELETE"); onDeleted(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Brisanje nije uspjelo."); }
  }

  return <form onSubmit={save} className="mt-6 space-y-4 border-t border-luxury-champagne pt-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Ime<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required className={input} /></label>
      <label className="block text-sm font-semibold">Telefon<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} className={input} /></label>
    </div>
    <label className="block text-sm font-semibold">Napomene<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Npr. formula boje, željena dužina" className={`${input} min-h-24`} /></label>
    <p className="text-xs text-luxury-charcoal/55">Ne upisujte zdravstvene podatke bez izričitog pristanka klijenta.</p>
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={blocked} onChange={(event) => setBlocked(event.target.checked)} className="accent-[#C5A059]" /> Blokiran za online zakazivanje</label>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className="rounded bg-luxury-gold px-5 py-3 text-xs font-semibold uppercase tracking-[.1em]">Sačuvaj</button><button type="button" onClick={() => void erase()} className="rounded border border-red-200 px-5 py-3 text-xs text-red-800">Obriši lične podatke</button></div>
  </form>;
}

function ClientPanel({ id, version, request, onChanged, onDeleted }: { id: string; version: number; request: AdminRequest; onChanged: (message: string) => void; onDeleted: () => void }) {
  const [loaded, setLoaded] = useState<{ key: string; client: ClientDetail | null; error: string }>({ key: "", client: null, error: "" });
  const key = `${id}-${version}`;

  useEffect(() => {
    let active = true;
    request(`/api/admin/clients/${id}`)
      .then((data) => { if (active) setLoaded({ key, client: (data as { client: ClientDetail }).client, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ key, client: null, error: caught instanceof Error ? caught.message : "Klijent nije dostupan." }); });
    return () => { active = false; };
  }, [id, key, request]);

  if (loaded.key !== key) return <section className="rounded-xl bg-white p-6 shadow-sm"><p className="text-sm text-luxury-charcoal/60">Učitavanje…</p></section>;
  if (!loaded.client) return <section className="rounded-xl bg-white p-6 shadow-sm"><p role="alert" className="text-sm text-red-800">{loaded.error}</p></section>;
  const client = loaded.client;
  return <section className="rounded-xl bg-white p-6 shadow-sm md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-serif text-3xl">{client.name || "Bez imena"}</h3><p className="mt-1 text-sm text-luxury-charcoal/60">{[client.phone, client.email].filter(Boolean).join(" · ") || "Bez kontakta"}</p></div>{client.blocked && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">Blokiran</span>}</div>
    <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {[["Dolazaka", client.visits], ["Nedolazaka", client.noShows], ["Otkazano", client.cancellations], ["Zakazano", client.upcoming]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#F8F5F0] p-3"><p className="text-xs text-luxury-charcoal/60">{label}</p><p className="font-serif text-2xl">{value}</p></div>)}
    </div>
    <p className="mt-3 text-sm text-luxury-charcoal/70">Ukupno evidentirano: {km(client.totalPaid)}{client.lastVisit ? ` · Posljednji dolazak: ${client.lastVisit}` : ""}</p>
    {client.deleted ? <p className="mt-6 text-sm text-luxury-charcoal/60">Lični podaci su obrisani. Ostala je samo evidencija posjeta i naplate.</p>
      : <ClientForm key={key} client={client} request={request} onChanged={onChanged} onDeleted={onDeleted} />}
    <h4 className="mt-8 font-serif text-2xl">Istorija</h4>
    {client.history.length === 0 ? <p className="mt-2 text-sm text-luxury-charcoal/60">Nema termina.</p> : <ul className="mt-3 space-y-2 text-sm">{client.history.map((item) =>
      <li key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-luxury-champagne/60 pb-2"><span>{item.date} {item.time} · {item.serviceName} · {item.staffName} · {SOURCE_LABELS[item.source] ?? item.source}</span><span>{STATUS_LABELS[item.status] ?? item.status}{item.paid ? ` · ${km(item.paid)}` : ""}</span></li>)}</ul>}
  </section>;
}

export default function Clients({ request }: { request: AdminRequest }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ key: string; clients: ClientSummary[]; error: string }>({ key: "", clients: [], error: "" });
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const key = `${query}-${version}`;

  // Debounce: wait until typing pauses for 250 ms before asking the server.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      request(`/api/admin/clients?q=${encodeURIComponent(query)}`)
        .then((data) => { if (active) setResults({ key, clients: (data as { clients: ClientSummary[] }).clients, error: "" }); })
        .catch((caught) => { if (active) setResults({ key, clients: [], error: caught instanceof Error ? caught.message : "Pretraga nije uspjela." }); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, key, request]);

  return <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
    <section className="h-fit rounded-xl bg-white p-6 shadow-sm md:p-8">
      <h2 className="font-serif text-3xl">Kartoteka klijenata</h2>
      <p className="mt-2 text-sm text-luxury-charcoal/60">Klijent se dodaje automatski kada termin ima broj telefona ili kada se prijavi na sajt.</p>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ime, telefon ili email" aria-label="Pretraga klijenata" className={`${input} mt-5`} />
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      {results.error && <p role="alert" className="mt-3 text-sm text-red-800">{results.error}</p>}
      <ul className="mt-4 space-y-2">{results.clients.map((client) => <li key={client.id}><button type="button" onClick={() => { setSelected(client.id); setNotice(""); }} aria-pressed={selected === client.id}
        className={`w-full rounded-lg border p-4 text-left text-sm ${selected === client.id ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne hover:border-luxury-gold"}`}>
        <span className="flex justify-between gap-2"><strong>{client.name || "Bez imena"}</strong>{client.blocked && <span className="text-xs text-red-800">Blokiran</span>}</span>
        <span className="mt-1 block text-xs text-luxury-charcoal/60">{client.phone || client.email || "Bez kontakta"} · dolazaka {client.visits} · nedolazaka {client.noShows}</span>
      </button></li>)}</ul>
      {results.key === key && !results.error && results.clients.length === 0 && <p className="mt-4 text-sm text-luxury-charcoal/60">Nema klijenata za ovu pretragu.</p>}
    </section>
    {selected ? <ClientPanel id={selected} version={version} request={request}
      onChanged={(message) => { setNotice(message); setVersion((value) => value + 1); }}
      onDeleted={() => { setNotice("Lični podaci su obrisani."); setVersion((value) => value + 1); }} />
      : <section className="h-fit rounded-xl border border-dashed border-luxury-champagne p-8 text-sm text-luxury-charcoal/60">Odaberite klijenta sa liste.</section>}
  </div>;
}
