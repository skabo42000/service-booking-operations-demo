"use client";

import { FormEvent, useState } from "react";
import HumanCheck from "./HumanCheck";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const field = "mt-2 w-full rounded-lg border border-luxury-champagne p-3 font-normal";

export type Account = { id: string; name: string; phone: string; email: string; blocked: boolean };

export async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Zahtjev nije uspio."), { status: response.status });
  return data as T;
}

export function ProfileForm({ account, onSaved, submitLabel = "Sačuvaj profil" }: { account: Account; onSaved: (account: Account) => void; submitLabel?: string }) {
  const [name, setName] = useState(account.name);
  const [phone, setPhone] = useState(account.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { onSaved((await sendJson<{ account: Account }>("/api/me", "PATCH", { name, phone })).account); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Čuvanje nije uspjelo."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={save} className="space-y-4">
    <label className="block text-sm font-semibold">Ime i prezime<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoComplete="name" className={field} /></label>
    <label className="block text-sm font-semibold">Telefon (opciono)<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={20} autoComplete="tel" placeholder="Npr. 065 000 000" className={field} /></label>
    <p className="text-xs text-luxury-charcoal/60">Demo: koristite izmišljene podatke.</p>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={busy} className="w-full rounded-lg bg-luxury-gold p-3 text-sm font-semibold disabled:opacity-50">{busy ? "Čuvanje…" : submitLabel}</button>
  </form>;
}

export default function LoginPanel({ googleEnabled, next, onSignedIn }: { googleEnabled: boolean; next: string; onSignedIn: (account: Account) => void }) {
  const [step, setStep] = useState<"email" | "code" | "profile">("email");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [humanToken, setHumanToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const data = await sendJson<{ challengeId: string; email: string; demoCode?: string }>("/api/auth/email/start", "POST", { email, turnstileToken: humanToken });
      setChallengeId(data.challengeId); setEmail(data.email); setDemoCode(data.demoCode ?? ""); setCode(""); setStep("code");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kod nije poslan."); }
    finally { setBusy(false); setHumanToken(""); setResetSignal((count) => count + 1); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { account: signedIn } = await sendJson<{ account: Account }>("/api/auth/email/verify", "POST", { challengeId, code });
      if (signedIn.name) onSignedIn(signedIn); else { setAccount(signedIn); setStep("profile"); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Prijava nije uspjela."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    {step === "email" && <>
      {googleEnabled && <><a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="flex w-full items-center justify-center gap-3 rounded-lg border border-luxury-champagne bg-white p-3 text-sm font-semibold hover:border-luxury-gold">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z" /></svg>
        Nastavite sa Google nalogom</a>
        <p className="text-center text-xs uppercase tracking-[.15em] text-luxury-charcoal/50">ili kodom na email</p></>}
      <form onSubmit={requestCode} className="space-y-4">
        <label className="block text-sm font-semibold">Email adresa<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={120} autoComplete="email" placeholder="ime@primjer.ba" className={field} /></label>
        <p className="text-xs text-luxury-charcoal/60">Demo ne šalje email: kod za prijavu biće prikazan na ekranu. Možete upisati izmišljenu adresu.</p>
        {TURNSTILE_SITE_KEY && <HumanCheck siteKey={TURNSTILE_SITE_KEY} onToken={setHumanToken} resetSignal={resetSignal} />}
        <button type="submit" disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !humanToken)} className="w-full rounded-lg bg-luxury-gold p-3 text-sm font-semibold disabled:opacity-50">{busy ? "Slanje…" : "Pošalji kod"}</button>
      </form>
    </>}
    {step === "code" && <form onSubmit={verify} className="space-y-4">
      <p className="text-sm leading-6">Kod za <strong>{email}</strong> važi 10 minuta.</p>
      {demoCode && <p className="rounded-lg bg-luxury-sand p-4 text-sm">Demo: u pravoj verziji kod stiže na email. Vaš kod je <strong className="font-mono text-lg tracking-[.3em]">{demoCode}</strong></p>}
      <label className="block text-sm font-semibold">Kod od 6 cifara<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} className={`${field} font-mono text-lg tracking-[.3em]`} /></label>
      <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-luxury-gold p-3 text-sm font-semibold disabled:opacity-50">{busy ? "Provjera…" : "Prijavi se"}</button>
      <button type="button" onClick={() => { setStep("email"); setError(""); }} className="w-full text-sm underline">Druga adresa ili novi kod</button>
    </form>}
    {step === "profile" && account && <div className="space-y-3"><p className="text-sm leading-6">Prijavljeni ste. Još samo ime, da salon zna na koga je termin.</p><ProfileForm account={account} onSaved={onSignedIn} submitLabel="Nastavi" /></div>}
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </div>;
}
