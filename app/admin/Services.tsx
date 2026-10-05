"use client";

import { FormEvent, useEffect, useState } from "react";
import { km, type AdminRequest } from "./BookingTools";
import type { ServiceRow } from "./Team";

const CATEGORY_LABELS: Record<string, string> = { nokti: "Nokti", kosa: "Kosa", depilacija: "Depilacija" };
const input = "mt-2 w-full rounded border border-luxury-champagne p-3 text-sm font-normal";

function priceText(fening: number | null) {
  return fening === null ? "" : km(fening).replace(" KM", "").replace(/\./g, "");
}

function ServiceForm({ service, request, onSaved }: { service?: ServiceRow; request: AdminRequest; onSaved: (message: string) => void }) {
  const [category, setCategory] = useState(service?.category ?? "nokti");
  const [name, setName] = useState(service?.name ?? "");
  const [durationMinutes, setDuration] = useState(service?.durationMinutes ?? 60);
  const [price, setPrice] = useState(priceText(service?.priceFening ?? null));
  const [active, setActive] = useState(service?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await request(service ? `/api/admin/services/${service.id}` : "/api/admin/services", service ? "PATCH" : "POST", { category, name, durationMinutes, price, active });
      if (!service) { setName(""); setPrice(""); }
      onSaved(service ? `Sačuvano: ${name}.` : `Dodata usluga: ${name}. Dodijelite je članovima tima u „Tim“.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Čuvanje nije uspjelo."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={save} className={`rounded-xl border bg-white p-6 ${service && !service.active ? "border-dashed border-luxury-champagne opacity-75" : "border-luxury-champagne"}`}>
    <p className="mb-4 text-xs uppercase tracking-[.15em] text-luxury-gold-ink">{service ? (service.active ? "Aktivna usluga" : "Neaktivna") : "Nova usluga"}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Kategorija<select value={category} onChange={(event) => setCategory(event.target.value)} className={input}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-semibold">Naziv<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required className={input} /></label>
      <label className="block text-sm font-semibold">Trajanje (min)<input type="number" value={durationMinutes} onChange={(event) => setDuration(Number(event.target.value))} min={15} max={480} step={15} required className={input} /></label>
      <label className="block text-sm font-semibold">Cijena u KM (prazno = nije potvrđena)<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="npr. 25,00" className={input} /></label>
    </div>
    <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="accent-[#C5A059]" /> Aktivna: nudi se u online zakazivanju</label>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={saving} className="mt-5 rounded bg-luxury-gold px-5 py-3 text-xs font-semibold uppercase tracking-[.1em] disabled:opacity-50">{saving ? "Čuvanje…" : service ? "Sačuvaj" : "Dodaj uslugu"}</button>
  </form>;
}

export default function Services({ request, onChanged }: { request: AdminRequest; onChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ version: number; services: ServiceRow[]; error: string } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    request("/api/admin/services")
      .then((data) => { if (active) setLoaded({ version, services: (data as { services: ServiceRow[] }).services, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ version, services: [], error: caught instanceof Error ? caught.message : "Usluge nisu dostupne." }); });
    return () => { active = false; };
  }, [request, version]);

  function saved(message: string) { setNotice(message); setVersion((value) => value + 1); onChanged(); }

  if (!loaded) return <p className="mt-8 text-sm text-luxury-charcoal/60">Učitavanje…</p>;
  return <section className="mt-8 space-y-5">
    <div><h2 className="font-serif text-3xl">Usluge</h2><p className="mt-2 text-sm text-luxury-charcoal/60">Solarijum se ne zakazuje, pa nije na ovoj listi. Cijena ostaje prazna dok je salon ne potvrdi; tada klijenti vide „cijena nije potvrđena“. Promjena trajanja važi za nove termine.</p></div>
    {notice && <p role="status" className="rounded border border-luxury-gold/50 bg-white p-4 text-sm">{notice}</p>}
    {loaded.error && <p role="alert" className="text-sm text-red-800">{loaded.error}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      {loaded.services.map((service) => <ServiceForm key={`${service.id}-${loaded.version}`} service={service} request={request} onSaved={saved} />)}
      <ServiceForm key={`nova-${loaded.version}`} request={request} onSaved={saved} />
    </div>
  </section>;
}
