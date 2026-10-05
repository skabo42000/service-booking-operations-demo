"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "../site";

type Person = { id: string; name: string; bio: string; serviceIds: string[]; shifts: { weekday: number; start: string; end: string }[] };

export default function TeamPreview() {
  const [people, setPeople] = useState<Person[]>([]);
  const [services, setServices] = useState<{ id: string; category: string }[]>([]);
  useEffect(() => {
    fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json()).then((catalog) => { setPeople(catalog.staff ?? []); setServices(catalog.services ?? []); }).catch(() => {});
  }, []);
  return <div className="grid gap-5 sm:grid-cols-2">
    {people.length === 0 && <p className="text-sm text-luxury-charcoal/60">Učitavanje profila tima…</p>}
    {people.map((person, index) => <div key={person.id} className={`rounded-xl bg-white p-8 shadow-sm ${index % 2 ? "sm:mt-10" : ""}`}>
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-luxury-sand font-serif text-4xl text-luxury-gold-ink">P</div>
      <p className="text-xs uppercase tracking-[.16em] text-luxury-gold-ink">Demo profil</p>
      <h3 className="mt-2 font-serif text-3xl">{person.name}</h3>
      <p className="mt-2 text-sm text-luxury-charcoal/60">{person.bio}</p>
      <p className="mt-5 text-xs text-luxury-charcoal/60">{CATEGORIES.filter((category) => services.some((service) => service.category === category.id && person.serviceIds.includes(service.id))).map((category) => category.name).join(" · ")}</p>
    </div>)}
  </div>;
}
