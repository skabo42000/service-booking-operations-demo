"use client";

import { useEffect, useState } from "react";
import { km, METHOD_LABELS, type AdminRequest } from "./BookingTools";

type Report = {
  date: string; byMethod: Record<string, number>; total: number; paymentCount: number; reversalCount: number;
  byStaff: { name: string; total: number }[]; byService: { name: string; total: number }[];
  arrived: number; noShows: number; unpaid: { id: string; time: string; clientName: string; serviceName: string; staffName: string }[];
};

function Totals({ title, items }: { title: string; items: { name: string; total: number }[] }) {
  return <section className="rounded-xl bg-white p-6 shadow-sm"><h3 className="font-serif text-2xl">{title}</h3>
    {items.length === 0 ? <p className="mt-3 text-sm text-luxury-charcoal/60">Nema naplata.</p> : <ul className="mt-3 space-y-2 text-sm">{items.map((item) =>
      <li key={item.name} className="flex justify-between gap-4 border-b border-luxury-champagne/60 pb-2"><span>{item.name}</span><strong>{km(item.total)}</strong></li>)}</ul>}
  </section>;
}

export default function Reports({ request, download, initialDate }: { request: AdminRequest; download: (path: string, filename: string) => Promise<void>; initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [loaded, setLoaded] = useState<{ date: string; report: Report | null; error: string }>({ date: "", report: null, error: "" });
  const [from, setFrom] = useState(`${initialDate.slice(0, 8)}01`);
  const [to, setTo] = useState(initialDate);

  useEffect(() => {
    if (!date) return;
    let active = true;
    request(`/api/admin/reports/daily?date=${encodeURIComponent(date)}`)
      .then((data) => { if (active) setLoaded({ date, report: data as Report, error: "" }); })
      .catch((caught) => { if (active) setLoaded({ date, report: null, error: caught instanceof Error ? caught.message : "Izvještaj nije dostupan." }); });
    return () => { active = false; };
  }, [date, request]);

  const report = loaded.date === date ? loaded.report : null;
  return <div className="mt-8 space-y-6">
    <section className="rounded-xl bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-serif text-3xl">Dnevni izvještaj naplate</h2><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Datum izvještaja" className="rounded border border-luxury-champagne p-2" /></div>
      <p className="mt-2 text-sm text-luxury-charcoal/60">Uporedite gotovinu i karticu sa dnevnim izvještajem fiskalne kase. Storno se računa na dan kada je upisan.</p>
      {loaded.error && loaded.date === date && <p role="alert" className="mt-4 text-sm text-red-800">{loaded.error}</p>}
      {!report && !loaded.error && <p className="mt-4 text-sm text-luxury-charcoal/60">Učitavanje…</p>}
      {report && <>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {Object.entries(METHOD_LABELS).map(([method, label]) => <div key={method} className="rounded-lg bg-[#F8F5F0] p-4"><p className="text-xs uppercase tracking-[.12em] text-luxury-charcoal/60">{label}</p><p className="mt-1 font-serif text-3xl">{km(report.byMethod[method] ?? 0)}</p></div>)}
          <div className="rounded-lg bg-luxury-charcoal p-4 text-white"><p className="text-xs uppercase tracking-[.12em] text-white/70">Ukupno</p><p className="mt-1 font-serif text-3xl">{km(report.total)}</p></div>
        </div>
        <p className="mt-4 text-sm text-luxury-charcoal/70">Naplata: {report.paymentCount} · Storno: {report.reversalCount} · Dolazaka: {report.arrived} · Nedolazaka: {report.noShows}</p>
        {report.unpaid.length > 0 && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Dolasci bez evidentirane naplate</p><ul className="mt-2 space-y-1">{report.unpaid.map((visit) => <li key={visit.id}>{visit.time} · {visit.clientName} · {visit.serviceName} · {visit.staffName}</li>)}</ul></div>}
      </>}
    </section>
    {report && <div className="grid gap-6 md:grid-cols-2"><Totals title="Po članu tima" items={report.byStaff} /><Totals title="Po usluzi" items={report.byService} /></div>}
    <section className="rounded-xl bg-white p-6 shadow-sm md:p-8">
      <h2 className="font-serif text-3xl">Izvoz za knjigovođu</h2>
      <p className="mt-2 text-sm text-luxury-charcoal/60">CSV fajl se otvara u Excelu: svaka naplata i storno u posebnom redu, sa brojem fiskalnog računa.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">Od<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-2 block rounded border border-luxury-champagne p-2 font-normal" /></label>
        <label className="text-sm font-semibold">Do<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-2 block rounded border border-luxury-champagne p-2 font-normal" /></label>
        <button type="button" onClick={() => void download(`/api/admin/reports/export?from=${from}&to=${to}`, `princess-naplata-${from}-${to}.csv`)} className="rounded bg-luxury-gold px-5 py-3 text-sm font-semibold">Preuzmi CSV</button>
      </div>
    </section>
  </div>;
}
