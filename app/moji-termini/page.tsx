import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { googleConfig } from "../../lib/auth";
import MyAccount from "./MyAccount";

export const metadata = { title: "Moji termini | Studio Princess", robots: { index: false, follow: false } };

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  const params = await searchParams;
  return <>
    <div className="bg-luxury-charcoal px-4 py-2 text-center text-xs tracking-wide text-white/85">DEMO VERZIJA · Probni nalozi i termini se brišu svake noći</div>
    <SiteHeader />
    <main className="min-h-screen bg-[#F7F3ED] px-5 pb-24 pt-16 md:px-8 md:pt-24">
      <div className="mx-auto max-w-4xl"><p className="font-script text-4xl text-luxury-gold-ink">Vaš nalog</p><h1 className="font-serif text-5xl md:text-7xl">Moji termini</h1></div>
      <MyAccount googleEnabled={Boolean(googleConfig())} googleError={params.greska === "google"} />
    </main>
    <SiteFooter />
  </>;
}
