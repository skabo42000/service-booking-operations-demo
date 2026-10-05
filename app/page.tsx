import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Sparkles, Sun } from "lucide-react";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import TeamPreview from "./components/TeamPreview";
import AssistantPanel from "./components/AssistantPanel";
import { CATEGORIES, INSTAGRAM_URL } from "./site";

export default function HomePage() {
  return <>
    <div className="bg-luxury-charcoal px-4 py-2 text-center text-xs tracking-wide text-white/85">DEMO VERZIJA · Probni termini nisu rezervacije u salonu</div>
    <SiteHeader />
    <main>
      <section className="relative overflow-hidden bg-[#F5F0EA] px-5 pb-24 pt-24 md:px-8 md:pb-32 md:pt-28">
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full border border-luxury-gold/25 md:h-[34rem] md:w-[34rem]" />
        <div aria-hidden className="pointer-events-none absolute -right-12 top-5 h-80 w-80 rounded-full border border-luxury-gold/20 md:h-[27rem] md:w-[27rem]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.15fr_.85fr]">
          <div className="max-w-3xl">
            <p className="font-script text-4xl text-luxury-gold-ink md:text-5xl">Dobro došli u Princess</p>
            <h1 className="mt-3 font-serif text-6xl leading-[.98] tracking-tight md:text-8xl">Vaš trenutak <em className="font-normal">ljepote</em> počinje ovdje.</h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-luxury-charcoal/75">Nokti, kosa i depilacija u Banjoj Luci. Odaberite uslugu i pronađite termin u našem demo kalendaru.</p>
            <div className="mt-10 flex flex-wrap gap-4"><Link href="/zakazivanje" className="inline-flex items-center gap-3 rounded-lg bg-luxury-gold px-8 py-4 text-xs font-semibold uppercase tracking-[0.15em] shadow-sm transition hover:bg-luxury-champagne">Pogledajte termine <ArrowRight size={17} /></Link><a href="#usluge" className="inline-flex items-center gap-3 rounded-lg border border-luxury-charcoal/15 bg-white/60 px-8 py-4 text-xs font-semibold uppercase tracking-[0.15em] transition hover:bg-white">Naše usluge</a></div>
          </div>
          <div className="relative mx-auto flex aspect-[4/5] w-full max-w-md items-center justify-center border border-luxury-gold/30 bg-luxury-bg p-8 shadow-[0_25px_70px_rgba(44,42,41,.08)]">
            <div className="absolute inset-4 border border-luxury-gold/25" />
            <div className="relative text-center"><Sparkles className="mx-auto mb-9 text-luxury-gold-ink" size={26} strokeWidth={1} /><p className="font-script text-5xl text-luxury-gold-ink">Studio ljepote</p><p className="mt-2 font-serif text-7xl md:text-8xl">Princess</p><div className="mx-auto mt-7 h-px w-20 bg-luxury-gold" /><p className="mt-7 text-xs uppercase tracking-[0.32em] text-luxury-charcoal/60">Banja Luka</p></div>
          </div>
        </div>
      </section>

      <section id="usluge" className="px-5 py-24 md:px-8 md:py-32"><div className="mx-auto max-w-7xl"><div className="text-center"><p className="font-script text-4xl text-luxury-gold-ink">Posvećeno vama</p><h2 className="font-serif text-5xl md:text-7xl">Naše usluge</h2><p className="mx-auto mt-5 max-w-2xl leading-7 text-luxury-charcoal/65">Istražite četiri kategorije njege. Cjenovnik još nije dostupan; cijene nisu navedene u demo verziji.</p></div><div className="mt-16 grid gap-6 md:grid-cols-2">{CATEGORIES.map((category, index) => <article key={category.id} className="group relative overflow-hidden rounded-xl border border-luxury-champagne/60 bg-[#F8F5F0] p-9 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-luxury-charcoal/5 md:p-12"><div className="mb-9 flex items-start justify-between"><span className="text-xs uppercase tracking-[.2em] text-luxury-gold-ink">0{index + 1} / {category.eyebrow}</span>{category.id === "solarijum" ? <Sun size={28} strokeWidth={1} className="text-luxury-gold-ink" /> : <Sparkles size={25} strokeWidth={1} className="text-luxury-gold-ink" />}</div><h3 className="font-serif text-5xl">{category.name}</h3><p className="mt-5 max-w-sm leading-7 text-luxury-charcoal/70">{category.description}</p><p className="mt-3 max-w-sm text-sm leading-6 text-luxury-charcoal/55">{category.detail}</p>{category.bookable ? <Link href={`/zakazivanje?usluga=${category.id}`} className="mt-9 inline-flex items-center gap-3 border-b border-luxury-gold pb-1 text-xs font-semibold uppercase tracking-[.16em] transition group-hover:gap-5">Izaberite termin <ArrowRight size={17} /></Link> : <span className="mt-9 inline-block rounded-full bg-luxury-champagne/60 px-4 py-2 text-xs font-semibold uppercase tracking-[.1em]">Bez zakazivanja</span>}</article>)}</div></div></section>

      <AssistantPanel />
      <section id="tim" className="bg-[#F5F0EA] px-5 py-24 md:px-8 md:py-32"><div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center"><div><p className="font-script text-4xl text-luxury-gold-ink">Ljudi iza svakog detalja</p><h2 className="mt-1 font-serif text-5xl md:text-7xl">Naš tim</h2><p className="mt-7 max-w-lg text-lg leading-8 text-luxury-charcoal/70">U demo kalendaru možete pregledati profile članova tima i njihove rasporede. Imena, fotografije i stvarne smjene unijećemo nakon potvrde sa salonom.</p><Link href="/zakazivanje" className="mt-8 inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[.15em] text-luxury-gold-ink">Pogledajte demo kalendar <ArrowRight size={17} /></Link></div><TeamPreview /></div></section>

      <section id="o-nama" className="px-5 py-24 text-center md:px-8 md:py-32"><div className="mx-auto max-w-3xl"><p className="font-script text-4xl text-luxury-gold-ink">Studio Princess</p><h2 className="font-serif text-5xl md:text-7xl">Vrijeme za sebe</h2><p className="mt-8 text-lg leading-9 text-luxury-charcoal/70">Na jednom mjestu istražite usluge, pronađite slobodan termin i saznajte kako funkcioniše posjeta salonu. Ova stranica prikazuje buduće iskustvo zakazivanja; probni termini nisu važeći u salonu.</p><div className="mx-auto mt-12 flex max-w-xl flex-wrap items-center justify-center gap-6 text-sm text-luxury-charcoal/70"><span className="inline-flex items-center gap-2"><MapPin size={17} /> Banja Luka, BiH</span><span className="inline-flex items-center gap-2"><CalendarDays size={17} /> Demo zakazivanje</span></div></div></section>

      <section className="bg-luxury-sand px-5 py-20 text-center md:px-8"><p className="font-script text-4xl text-luxury-gold-ink">Uvijek ste dobrodošli</p><h2 className="font-serif text-5xl md:text-6xl">Solarijum bez zakazivanja</h2><p className="mx-auto mt-5 max-w-xl leading-7 text-luxury-charcoal/70">Za solarijum nije potrebno zakazivanje. Informacije o radnom vremenu i cijenama potražite na zvaničnom profilu salona.</p><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-3 rounded-lg bg-luxury-charcoal px-7 py-4 text-xs font-semibold uppercase tracking-[.14em] text-white"><ExternalLink size={17} /> Instagram</a></section>
    </main>
    <SiteFooter />
  </>;
}
