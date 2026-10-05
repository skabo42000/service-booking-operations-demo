import Link from "next/link";
import { FACEBOOK_URL, INSTAGRAM_URL } from "../site";

export default function SiteFooter() {
  return <footer id="kontakt" className="bg-luxury-charcoal px-5 py-14 text-[#FAF8F5] md:px-8">
    <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3">
      <div><p className="font-serif text-4xl">Princess</p><p className="font-script text-3xl text-luxury-gold">Trenuci posvećeni vama</p><p className="mt-5 max-w-xs text-sm leading-7 text-white/70">Studio ljepote u Banjoj Luci. Ova stranica je demo prikaz sistema za zakazivanje.</p></div>
      <div><h2 className="mb-5 text-xs uppercase tracking-[0.2em] text-luxury-gold">Istražite</h2><div className="flex flex-col gap-3 text-sm text-white/80"><Link href="/#usluge">Usluge</Link><Link href="/#pitanja">AI vodič</Link><Link href="/#tim">Naš tim</Link><Link href="/zakazivanje">Demo zakazivanje</Link><Link href="/admin">Prijava za osoblje</Link></div></div>
      <div><h2 className="mb-5 text-xs uppercase tracking-[0.2em] text-luxury-gold">Pronađite nas</h2><p className="text-sm text-white/80">Banja Luka, BiH</p><div className="mt-4 flex gap-5 text-sm text-white/80"><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Instagram</a><a href={FACEBOOK_URL} target="_blank" rel="noreferrer">Facebook</a></div><p className="mt-5 text-xs text-white/60">Za solarijum nije potrebno zakazivanje.</p></div>
    </div>
    <div className="mx-auto mt-12 flex max-w-7xl flex-wrap justify-between gap-3 border-t border-white/15 pt-6 text-xs text-white/50"><p>© {new Date().getFullYear()} Studio Princess · Demo verzija</p><Link href="/privatnost" className="hover:text-white">Privatnost</Link></div>
  </footer>;
}
