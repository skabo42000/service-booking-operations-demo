"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window { turnstile?: Turnstile }
}

// Cloudflare Turnstile: usually invisible for people, blocks automated booking scripts.
export default function HumanCheck({ siteKey, onToken, resetSignal }: { siteKey: string; onToken: (token: string) => void; resetSignal: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !box.current || !window.turnstile) return;
    const turnstile = window.turnstile;
    widget.current = turnstile.render(box.current, {
      sitekey: siteKey, action: "booking", theme: "light", size: "flexible",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    return () => {
      if (widget.current) turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [loaded, siteKey, onToken]);

  useEffect(() => {
    if (resetSignal && widget.current) window.turnstile?.reset(widget.current);
  }, [resetSignal]);

  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setLoaded(true)} />
    <div ref={box} className="mt-6 min-h-[65px]" />
  </>;
}
