"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/#usluge", label: "Usluge" },
  { href: "/#pitanja", label: "Pitanja" },
  { href: "/#tim", label: "Tim" },
  { href: "/#o-nama", label: "O nama" },
  { href: "/#kontakt", label: "Kontakt" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-luxury-champagne/50 bg-luxury-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Link href="/" onClick={() => setOpen(false)} className="font-serif text-3xl leading-none tracking-wide" aria-label="Studio Princess, početna">
          Princess<span className="ml-2 align-middle font-sans text-[10px] uppercase tracking-[0.25em] text-luxury-gold-ink">Studio ljepote</span>
        </Link>
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Glavna navigacija">
          {links.map((link) => <Link key={link.href} href={link.href} className="text-xs uppercase tracking-[0.16em] hover:text-luxury-gold-ink">{link.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-4 sm:flex">
          <Link href="/moji-termini" className="text-xs uppercase tracking-[0.16em] hover:text-luxury-gold-ink">Moji termini</Link>
          <Link href="/zakazivanje" className="rounded-lg bg-luxury-gold px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition hover:bg-luxury-champagne">Zakažite termin</Link>
        </div>
        <button type="button" aria-expanded={open} aria-controls="mobilna-navigacija" aria-label={open ? "Zatvori meni" : "Otvori meni"} className="rounded-md p-2 sm:hidden" onClick={() => setOpen(!open)}>
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
      {open && <nav id="mobilna-navigacija" className="flex flex-col gap-1 border-t border-luxury-champagne/50 px-5 py-3 sm:hidden" aria-label="Mobilna navigacija">
        {links.map((link) => <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="py-3 text-sm">{link.label}</Link>)}
        <Link href="/moji-termini" onClick={() => setOpen(false)} className="py-3 text-sm">Moji termini</Link>
        <Link href="/zakazivanje" onClick={() => setOpen(false)} className="my-2 rounded-lg bg-luxury-gold px-5 py-3 text-center text-sm font-semibold">Zakažite termin</Link>
      </nav>}
    </header>
  );
}
