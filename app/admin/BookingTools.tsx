"use client";

import { FormEvent, useEffect, useState } from "react";

export type Service = { id: string; category: string; name: string; durationMinutes: number };
export type Shift = { weekday: number; start: string; end: string };
export type Person = { id: string; name: string; bio: string; serviceIds: string[]; shifts: Shift[] };
export type Catalog = { services: Service[]; staff: Person[] };
export type Payment = { id: string; amount: number; method: string; receiptNumber: string; reversesId: string | null; reversed: boolean };
export type Booking = {
  id: string; date: string; time: string; endTime: string; clientName: string; clientPhone: string; source: string; note: string;
  status: string; serviceId: string; serviceName: string; staffId: string; staffName: string; payments: Payment[];
  clientId: string | null; clientBlocked: boolean; clientNoShows: number;
};
export type AdminRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;
type KnownClient = { name: string; visits: number; noShows: number; blocked: boolean };

export const STATUS_LABELS: Record<string, string> = { confirmed: "Zakazano", arrived: "Dolazak", no_show: "Nedolazak", cancelled: "Otkazano" };
export const SOURCE_LABELS: Record<string, string> = { online: "Online", phone: "Telefon", message: "Poruka (Instagram/Facebook)", walk_in: "Lično u salonu" };
const BADGES: Record<string, string> = {
  confirmed: "bg-luxury-sand text-luxury-gold-ink", arrived: "bg-luxury-charcoal text-white",
  no_show: "bg-red-50 text-red-800", cancelled: "bg-[#EFEBE6] text-luxury-charcoal/60",
};
export const METHOD_LABELS: Record<string, string> = { cash: "Gotovina", card: "Kartica", gift_card: "Poklon bon" };
const input = "mt-2 w-full rounded border border-luxury-champagne p-3 text-sm font-normal";

export function km(fening: number): string {
  const absolute = Math.abs(fening);
  return `${fening < 0 ? "−" : ""}${Math.floor(absolute / 100).toLocaleString("sr-Latn-BA")},${String(absolute % 100).padStart(2, "0")} KM`;
}

function PaymentPanel({ booking, onPay, onReverse }: {
  booking: Booking; onPay: (body: Record<string, string>) => Promise<boolean>; onReverse?: (paymentId: string) => Promise<boolean>;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const net = booking.payments.reduce((sum, payment) => sum + payment.amount, 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const saved = await onPay({ requestId, amount, method, receiptNumber });
    setSaving(false);
    if (saved) { setAmount(""); setReceiptNumber(""); setRequestId(crypto.randomUUID()); }
  }

  return <div className="mt-4 border-t border-luxury-champagne pt-4">
    <p className="text-sm font-semibold">Naplata: {km(net)}</p>
    {booking.payments.length > 0 && <ul className="mt-2 space-y-1 text-sm">{booking.payments.map((payment) => <li key={payment.id} className={`flex flex-wrap items-center gap-2 ${payment.reversed ? "text-luxury-charcoal/45 line-through" : payment.amount < 0 ? "text-luxury-charcoal/60" : ""}`}>
      <span>{payment.amount < 0 ? "Storno " : ""}{km(payment.amount)} · {METHOD_LABELS[payment.method] ?? payment.method}{payment.receiptNumber ? ` · račun ${payment.receiptNumber}` : ""}</span>
      {onReverse && payment.amount > 0 && !payment.reversed && <button type="button" onClick={() => { if (window.confirm(`Stornirati naplatu od ${km(payment.amount)}?`)) void onReverse(payment.id); }} className="text-xs underline">Storniraj</button>}
    </li>)}</ul>}
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="block text-xs font-semibold">Iznos (KM)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="npr. 25,00" required className={input} /></label>
      <label className="block text-xs font-semibold">Način<select value={method} onChange={(event) => setMethod(event.target.value)} className={input}>{Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-xs font-semibold">Broj fiskalnog računa<input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} maxLength={40} placeholder="opciono" className={input} /></label>
      <button type="submit" disabled={saving} className="rounded bg-luxury-gold px-4 py-3 text-xs font-semibold disabled:opacity-50">{saving ? "Čuvanje…" : "Evidentiraj"}</button>
    </form>
    <p className="mt-2 text-xs text-luxury-charcoal/55">Samo evidencija. Fiskalni račun izdaje kasa salona.</p>
  </div>;
}

function SlotPicker({ request, serviceId, staffId, date, ignore = "", value, onChange }: {
  request: AdminRequest; serviceId: string; staffId: string; date: string; ignore?: string; value: string; onChange: (time: string) => void;
}) {
  const query = serviceId && staffId && date ? new URLSearchParams({ serviceId, staffId, date, ignore }).toString() : "";
  const [loaded, setLoaded] = useState<{ query: string; slots: string[]; error: string }>({ query: "", slots: [], error: "" });

  useEffect(() => {
    if (!query) return;
    let active = true;
    request(`/api/admin/availability?${query}`)
      .then((data) => { if (active) setLoaded({ query, slots: (data as { slots: string[] }).slots, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ query, slots: [], error: caught instanceof Error ? caught.message : "Termini nisu dostupni." }); });
    return () => { active = false; };
  }, [query, request]);

  if (!query) return <p className="mt-2 text-sm text-luxury-charcoal/60">Odaberite uslugu, člana tima i datum.</p>;
  if (loaded.query !== query) return <p className="mt-2 text-sm text-luxury-charcoal/60">Učitavanje slobodnih termina…</p>;
  if (loaded.error) return <p className="mt-2 text-sm text-red-800">{loaded.error}</p>;
  if (loaded.slots.length === 0) return <p className="mt-2 text-sm text-luxury-charcoal/60">Nema slobodnih termina za taj dan.</p>;
  return <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">{loaded.slots.map((slot) =>
    <button key={slot} type="button" onClick={() => onChange(slot)} aria-pressed={value === slot}
      className={`rounded border px-2 py-2 text-sm ${value === slot ? "border-luxury-gold bg-luxury-gold font-semibold" : "border-luxury-champagne hover:border-luxury-gold"}`}>{slot}</button>)}</div>;
}

export function NewBookingForm({ catalog, initialDate, request, onSave, onClose }: {
  catalog: Catalog; initialDate: string; request: AdminRequest; onSave: (body: Record<string, string>) => Promise<boolean>; onClose: () => void;
}) {
  const [serviceId, setServiceId] = useState(catalog.services[0]?.id ?? "");
  const capable = catalog.staff.filter((person) => person.serviceIds.includes(serviceId));
  const [staffId, setStaffId] = useState(capable[0]?.id ?? "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [source, setSource] = useState("phone");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [known, setKnown] = useState<{ phone: string; client: KnownClient | null } | null>(null);

  async function lookUpPhone() {
    const phone = clientPhone.trim();
    if (phone.length < 6 || known?.phone === phone) return;
    try {
      const { client } = await request(`/api/admin/clients?phone=${encodeURIComponent(phone)}`) as { client: KnownClient | null };
      setKnown({ phone, client });
      if (client && !clientName.trim()) setClientName(client.name);
    } catch { setKnown(null); }
  }

  function chooseService(next: string) {
    setServiceId(next); setTime("");
    if (!catalog.staff.some((person) => person.id === staffId && person.serviceIds.includes(next)))
      setStaffId(catalog.staff.find((person) => person.serviceIds.includes(next))?.id ?? "");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!time) return;
    setSaving(true);
    const saved = await onSave({ serviceId, staffId, date, time, clientName, clientPhone, source, note });
    setSaving(false);
    if (saved) onClose(); else setTime("");
  }

  return <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-luxury-gold/50 bg-luxury-bg p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-2xl">Novi termin</h3><button type="button" onClick={onClose} className="text-sm underline">Zatvori</button></div>
    <p className="text-xs text-luxury-charcoal/60">Za termine dogovorene telefonom, porukom ili u salonu. Demo: unesite izmišljene podatke.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Usluga<select value={serviceId} onChange={(event) => chooseService(event.target.value)} className={input}>{catalog.services.map((service) => <option key={service.id} value={service.id}>{service.name} ({service.durationMinutes} min)</option>)}</select></label>
      <label className="block text-sm font-semibold">Član tima<select value={staffId} onChange={(event) => { setStaffId(event.target.value); setTime(""); }} className={input}>{capable.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Datum<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} required className={input} /></label>
      <label className="block text-sm font-semibold">Dogovoreno<select value={source} onChange={(event) => setSource(event.target.value)} className={input}>{["phone", "message", "walk_in"].map((item) => <option key={item} value={item}>{SOURCE_LABELS[item]}</option>)}</select></label>
    </div>
    <div><p className="text-sm font-semibold">Vrijeme</p><SlotPicker request={request} serviceId={serviceId} staffId={staffId} date={date} value={time} onChange={setTime} /></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Ime klijenta<input value={clientName} onChange={(event) => setClientName(event.target.value)} minLength={2} maxLength={80} required className={input} /></label>
      <label className="block text-sm font-semibold">Telefon (opciono)<input type="tel" value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} onBlur={() => void lookUpPhone()} maxLength={20} placeholder="Npr. 065 000 000" className={input} /></label>
    </div>
    {known?.phone === clientPhone.trim() && <p className={`rounded p-3 text-xs ${known.client?.blocked ? "bg-red-50 text-red-900" : "bg-luxury-sand/60"}`}>{known.client
      ? <>Postojeći klijent: <strong>{known.client.name}</strong> · dolazaka {known.client.visits} · nedolazaka {known.client.noShows}{known.client.blocked ? " · označen kao blokiran" : ""}</>
      : "Novi klijent: biće dodat u kartoteku."}</p>}
    <label className="block text-sm font-semibold">Napomena (opciono)<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} className={input} /></label>
    <button type="submit" disabled={saving || !time} className="w-full rounded bg-luxury-gold p-3 text-sm font-semibold disabled:opacity-50">{saving ? "Čuvanje…" : time ? `Sačuvaj termin u ${time}` : "Odaberite vrijeme"}</button>
  </form>;
}

function RescheduleForm({ booking, catalog, request, onSave, onClose }: {
  booking: Booking; catalog: Catalog; request: AdminRequest; onSave: (body: Record<string, string>) => Promise<boolean>; onClose: () => void;
}) {
  const [staffId, setStaffId] = useState(booking.staffId);
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);
  const capable = catalog.staff.filter((person) => person.serviceIds.includes(booking.serviceId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!time) return;
    setSaving(true);
    const saved = await onSave({ staffId, date, time });
    setSaving(false);
    if (saved) onClose(); else setTime("");
  }

  return <form onSubmit={submit} className="mt-4 space-y-4 border-t border-luxury-champagne pt-4">
    <p className="text-sm font-semibold">Premještanje termina</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Član tima<select value={staffId} onChange={(event) => { setStaffId(event.target.value); setTime(""); }} className={input}>{capable.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Datum<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setTime(""); }} required className={input} /></label>
    </div>
    <SlotPicker request={request} serviceId={booking.serviceId} staffId={staffId} date={date} ignore={booking.id} value={time} onChange={setTime} />
    <div className="flex flex-wrap gap-2"><button type="submit" disabled={saving || !time} className="rounded bg-luxury-gold px-4 py-2 text-xs font-semibold disabled:opacity-50">{time ? `Premjesti na ${time}` : "Odaberite vrijeme"}</button><button type="button" onClick={onClose} className="rounded border border-luxury-champagne px-4 py-2 text-xs">Odustani</button></div>
  </form>;
}

export function BookingCard({ booking, today, catalog, request, onStatus, onCancel, onReschedule, onPay, onReverse }: {
  booking: Booking; today: string; catalog: Catalog; request: AdminRequest;
  onStatus: (status: string) => Promise<boolean>; onCancel: () => Promise<boolean>; onReschedule: (body: Record<string, string>) => Promise<boolean>;
  onPay: (body: Record<string, string>) => Promise<boolean>; onReverse?: (paymentId: string) => Promise<boolean>;
}) {
  const [moving, setMoving] = useState(false);
  const button = "rounded border border-luxury-champagne px-3 py-2 text-xs hover:border-luxury-gold";
  const canMarkVisit = booking.date <= today;
  return <div className={`rounded-lg border p-5 ${booking.status === "cancelled" ? "border-luxury-champagne bg-[#FAF8F5] opacity-60" : booking.status === "no_show" ? "border-red-200" : "border-luxury-gold/50"}`}>
    <div className="flex flex-wrap justify-between gap-3">
      <div>
        <p className="font-serif text-2xl">{booking.time}–{booking.endTime} · {booking.serviceName}</p>
        <p className="mt-1 text-sm text-luxury-charcoal/70">{booking.staffName} · {booking.clientName}{booking.clientPhone ? ` · ${booking.clientPhone}` : ""}</p>
        <p className="mt-1 text-xs text-luxury-charcoal/55">{SOURCE_LABELS[booking.source] ?? booking.source}{booking.note ? ` · ${booking.note}` : ""}</p>
        {(booking.clientNoShows > 0 || booking.clientBlocked) && <p className="mt-1 text-xs font-semibold text-red-800">{[booking.clientNoShows > 0 ? `Ranijih nedolazaka: ${booking.clientNoShows}` : "", booking.clientBlocked ? "Blokiran klijent" : ""].filter(Boolean).join(" · ")}</p>}
      </div>
      <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${BADGES[booking.status] ?? ""}`}>{STATUS_LABELS[booking.status] ?? booking.status}</span>
    </div>
    {booking.status === "confirmed" && !moving && <div className="mt-4 flex flex-wrap gap-2">
      {canMarkVisit && <><button type="button" onClick={() => void onStatus("arrived")} className={button}>Označi dolazak</button><button type="button" onClick={() => void onStatus("no_show")} className={button}>Označi nedolazak</button></>}
      <button type="button" onClick={() => setMoving(true)} className={button}>Premjesti</button>
      <button type="button" onClick={() => void onCancel()} className={button}>Otkaži</button>
    </div>}
    {(booking.status === "arrived" || booking.status === "no_show") && <div className="mt-4"><button type="button" onClick={() => void onStatus("confirmed")} className={button}>Vrati na zakazano</button></div>}
    {booking.status === "arrived" && <PaymentPanel booking={booking} onPay={onPay} onReverse={onReverse} />}
    {moving && <RescheduleForm booking={booking} catalog={catalog} request={request} onSave={onReschedule} onClose={() => setMoving(false)} />}
  </div>;
}
