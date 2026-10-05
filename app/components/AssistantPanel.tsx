"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

const suggestions = ["Koje usluge imate?", "Da li se solarijum zakazuje?", "Jesu li cijene dostupne?"];

export default function AssistantPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask(value: string) {
    if (value.trim().length < 3) return;
    setLoading(true); setAnswer(""); setError(""); setQuestion(value);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Vodič trenutno nije dostupan.");
      setAnswer(body.answer);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Vodič trenutno nije dostupan."); }
    finally { setLoading(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void ask(question); }

  return <section id="pitanja" className="bg-luxury-charcoal px-5 py-24 text-[#FAF8F5] md:px-8 md:py-32">
    <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:gap-20">
      <div><p className="font-script text-4xl text-luxury-gold">Tu smo za vaša pitanja</p><h2 className="mt-1 font-serif text-5xl md:text-7xl">Pitajte našeg vodiča</h2><p className="mt-6 max-w-lg leading-8 text-white/70">AI vodič odgovara na pitanja o potvrđenim informacijama salona. Ne može potvrditi stvarne termine, cijene ili raspored zaposlenih.</p><div className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[.16em] text-luxury-gold"><Sparkles size={17} /> Odgovori na srpskom</div></div>
      <div className="rounded-xl bg-luxury-bg p-7 text-luxury-charcoal shadow-xl md:p-10"><h3 className="font-serif text-3xl">Šta vas zanima?</h3><p className="mt-2 text-sm leading-6 text-luxury-charcoal/60">Bez ličnih podataka. Svako pitanje se obrađuje zasebno.</p><div className="mt-6 flex flex-wrap gap-2">{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={loading} onClick={() => void ask(suggestion)} className="rounded-full border border-luxury-champagne px-4 py-2 text-xs transition hover:bg-luxury-sand disabled:opacity-50">{suggestion}</button>)}</div><form onSubmit={submit} className="mt-7 flex flex-col gap-3 sm:flex-row"><label htmlFor="pitanje" className="sr-only">Vaše pitanje</label><input id="pitanje" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={500} placeholder="Upišite pitanje…" required className="min-w-0 flex-1 rounded-lg border border-luxury-champagne bg-white px-4 py-3 text-sm" /><button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-luxury-gold px-6 py-3 text-xs font-semibold uppercase tracking-[.12em] disabled:opacity-50">{loading ? "Razmišljam…" : "Pitajte"} <ArrowRight size={17} /></button></form>{answer && <div role="status" className="mt-7 rounded-lg bg-luxury-sand/70 p-5"><p className="mb-2 text-xs font-semibold uppercase tracking-[.14em] text-luxury-gold-ink">Odgovor vodiča</p><p className="whitespace-pre-wrap text-sm leading-7">{answer}</p></div>}{error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}</div>
    </div>
  </section>;
}
