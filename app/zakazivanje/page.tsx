import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import BookingFlow from "./BookingFlow";
import { googleConfig } from "../../lib/auth";

export default async function BookingPage({ searchParams }: { searchParams: Promise<{ usluga?: string }> }) {
  const params = await searchParams;
  return <>
    <div className="bg-luxury-charcoal px-4 py-2 text-center text-xs tracking-wide text-white/85">DEMO VERZIJA · Probni termini nisu rezervacije u salonu</div>
    <SiteHeader />
    <main className="min-h-screen bg-[#F7F3ED] px-5 pb-24 pt-16 md:px-8 md:pt-24">
      <div className="mx-auto max-w-6xl"><p className="font-script text-4xl text-luxury-gold-ink">Vrijeme za vas</p><h1 className="font-serif text-5xl md:text-7xl">Zakažite demo termin</h1><p className="mt-5 max-w-2xl leading-7 text-luxury-charcoal/70">Odaberite uslugu, člana tima i slobodno vrijeme. Potvrda važi samo u ovom demo prikazu i ne rezerviše termin u salonu. Probni termini se brišu svake noći.</p></div>
      <BookingFlow initialCategory={params.usluga} googleEnabled={Boolean(googleConfig())} />
    </main>
    <SiteFooter />
  </>;
}
