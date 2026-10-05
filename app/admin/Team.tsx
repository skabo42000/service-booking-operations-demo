"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AdminRequest } from "./BookingTools";

type Member = { id: string; name: string; bio: string; email: string; serviceIds: string[]; active: boolean };
export type ServiceRow = { id: string; category: string; name: string; durationMinutes: number; priceFening: number | null; active: boolean };

const input = "mt-2 w-full rounded border border-luxury-champagne p-3 text-sm font-normal";

function MemberForm({ member, services, request, onSaved }: { member?: Member; services: ServiceRow[]; request: AdminRequest; onSaved: (message: string) => void }) {
  const [name, setName] = useState(member?.name ?? "");
  const [bio, setBio] = useState(member?.bio ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(member?.serviceIds ?? []);
  const [active, setActive] = useState(member?.active ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const offered = services.filter((service) => service.active || serviceIds.includes(service.id));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      await request(member ? `/api/admin/team/${member.id}` : "/api/admin/team", member ? "PATCH" : "POST", { name, bio, email, serviceIds, active });
      if (!member) { setName(""); setBio(""); setEmail(""); setServiceIds([]); }
      onSaved(member ? `Sačuvano: ${name}.` : `Dodat član tima: ${name}. Postavite mu smjene u „Rasporedi“.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Čuvanje nije uspjelo."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={save} className={`rounded-xl border bg-white p-6 ${member && !member.active ? "border-dashed border-luxury-champagne opacity-75" : "border-luxury-champagne"}`}>
    <p className="mb-4 text-xs uppercase tracking-[.15em] text-luxury-gold-ink">{member ? (member.active ? "Aktivan član tima" : "Neaktivan") : "Novi član tima"}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Ime<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required className={input} /></label>
      <label className="block text-sm font-semibold">Email za prijavu (opciono)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={120} className={input} /></label>
    </div>
    <label className="mt-4 block text-sm font-semibold">Kratak opis (vidljiv klijentima)<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={240} required className={`${input} min-h-20`} /></label>
    <fieldset className="mt-4"><legend className="text-sm font-semibold">Usluge koje radi</legend><div className="mt-2 flex flex-wrap gap-2">{offered.map((service) =>
      <label key={service.id} className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${serviceIds.includes(service.id) ? "border-luxury-gold bg-luxury-sand/60" : "border-luxury-champagne"}`}>
        <input type="checkbox" checked={serviceIds.includes(service.id)} onChange={(event) => setServiceIds(event.target.checked ? [...serviceIds, service.id] : serviceIds.filter((id) => id !== service.id))} className="accent-[#C5A059]" />
        {service.name}{service.active ? "" : " (neaktivna)"}
      </label>)}</div></fieldset>
    <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="accent-[#C5A059]" /> Aktivan: vidljiv klijentima i može se prijaviti</label>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={saving} className="mt-5 rounded bg-luxury-gold px-5 py-3 text-xs font-semibold uppercase tracking-[.1em] disabled:opacity-50">{saving ? "Čuvanje…" : member ? "Sačuvaj" : "Dodaj člana tima"}</button>
  </form>;
}

export default function Team({ request, onChanged }: { request: AdminRequest; onChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ version: number; team: Member[]; services: ServiceRow[]; error: string } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([request("/api/admin/team"), request("/api/admin/services")])
      .then(([team, services]) => { if (active) setLoaded({ version, team: (team as { team: Member[] }).team, services: (services as { services: ServiceRow[] }).services, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ version, team: [], services: [], error: caught instanceof Error ? caught.message : "Tim nije dostupan." }); });
    return () => { active = false; };
  }, [request, version]);

  function saved(message: string) { setNotice(message); setVersion((value) => value + 1); onChanged(); }

  if (!loaded) return <p className="mt-8 text-sm text-luxury-charcoal/60">Učitavanje…</p>;
  return <section className="mt-8 space-y-5">
    <div><h2 className="font-serif text-3xl">Tim</h2><p className="mt-2 text-sm text-luxury-charcoal/60">Član tima bez aktivnih usluga i smjena ne pojavljuje se u online zakazivanju. Neaktivan član se ne briše, da istorija termina ostane tačna.</p></div>
    {notice && <p role="status" className="rounded border border-luxury-gold/50 bg-white p-4 text-sm">{notice}</p>}
    {loaded.error && <p role="alert" className="text-sm text-red-800">{loaded.error}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      {loaded.team.map((member) => <MemberForm key={`${member.id}-${loaded.version}`} member={member} services={loaded.services} request={request} onSaved={saved} />)}
      <MemberForm key={`novi-${loaded.version}`} services={loaded.services} request={request} onSaved={saved} />
    </div>
  </section>;
}
