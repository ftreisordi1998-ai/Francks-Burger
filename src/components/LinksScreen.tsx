"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { LINKS_PAGE_PRODUCT_IMAGES, LINKS_PAGE_URLS } from "@/lib/links-config";

export function LinksScreen({ ordersOpen }: { ordersOpen: boolean }) {
  const [animEnabled, setAnimEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [steamInView, setSteamInView] = useState(true);
  const [ctaPulse, setCtaPulse] = useState(false);
  const steamRef = useRef<HTMLDivElement>(null);
  const pulseFiredRef = useRef(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    setAnimEnabled(!mql.matches);
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    function onVisibility() {
      setTabVisible(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const el = steamRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setSteamInView(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion || !animEnabled || pulseFiredRef.current) return;
    const timer = setTimeout(() => {
      if (pulseFiredRef.current) return;
      pulseFiredRef.current = true;
      setCtaPulse(true);
      setTimeout(() => setCtaPulse(false), 950);
    }, 8000);
    return () => clearTimeout(timer);
  }, [reducedMotion, animEnabled]);

  const steamPlaying = animEnabled && tabVisible && steamInView && !reducedMotion;
  const showAnim = animEnabled && !reducedMotion;

  function revealStyle(index: number): React.CSSProperties {
    if (reducedMotion) return {};
    return { "--reveal-delay": `${index * 70}ms` } as React.CSSProperties;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pb-10 pt-[calc(env(safe-area-inset-top)+28px)]">
      <header className={reducedMotion ? "flex flex-col items-center text-center" : "links-reveal flex flex-col items-center text-center"} style={revealStyle(0)}>
        <Logo size={64} />
        <h1 className="mt-4 text-[26px] font-extrabold leading-tight text-coffee">
          Direto da brasa pra sua casa.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-coffee-soft">
          Burgers na brasa, por encomenda, uma vez por semana. Uraí · PR.
        </p>
      </header>

      <div
        ref={steamRef}
        className={reducedMotion ? "relative mt-6 flex items-end justify-center gap-3" : "links-reveal relative mt-6 flex items-end justify-center gap-3"}
        style={revealStyle(1)}
      >
        {LINKS_PAGE_PRODUCT_IMAGES.map((product, i) => (
          <div key={product.name} className="relative">
            <Steam active={steamPlaying} seed={i} />
            <div className="relative z-10 h-[92px] w-[92px] overflow-hidden rounded-[22px] bg-cream-soft shadow-[0_6px_16px_rgba(44,24,16,0.1)] sm:h-[108px] sm:w-[108px]">
              <Image
                src={product.url}
                alt={product.name}
                fill
                sizes="112px"
                className="object-cover"
                priority={i === 1}
              />
            </div>
          </div>
        ))}
      </div>

      <div
        className={reducedMotion ? "mt-7 flex justify-center" : "links-reveal mt-7 flex justify-center"}
        style={revealStyle(2)}
        aria-hidden
      >
        <span className="h-px w-16 bg-gradient-to-r from-transparent via-orange/35 to-transparent" />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <div className={reducedMotion ? "" : "links-reveal"} style={revealStyle(3)}>
          <Link
            href={LINKS_PAGE_URLS.order}
            className={`group flex min-h-[76px] w-full flex-col items-start justify-center gap-0.5 rounded-[20px] bg-orange px-5 py-4 text-left shadow-[0_8px_20px_-6px_rgba(232,84,15,0.35)] transition duration-150 [transition-property:transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-6px_rgba(232,84,15,0.45)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-dark focus-visible:ring-offset-2 focus-visible:ring-offset-cream ${
              ctaPulse ? "links-cta-pulse" : ""
            }`}
          >
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-white/70">
              Pedidos
            </span>
            <span className="flex w-full items-center justify-between gap-3">
              <span className="text-[17px] font-extrabold text-white">Faça sua encomenda</span>
              <ArrowIcon className="shrink-0 text-white transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
            <span className="text-[13px] font-medium text-white/85">
              Escolha seu burger e confira a próxima edição.
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-white/75">
              <span
                className={`h-1.5 w-1.5 rounded-full ${ordersOpen ? "bg-white" : "bg-white/60"}`}
                aria-hidden
              />
              {ordersOpen ? "Encomendas abertas" : "Confira a próxima edição"}
            </span>
          </Link>
        </div>

        <div className={reducedMotion ? "" : "links-reveal"} style={revealStyle(4)}>
          <a
            href={LINKS_PAGE_URLS.whatsappGroup}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[76px] w-full flex-col items-start justify-center gap-0.5 rounded-[20px] bg-white px-5 py-4 text-left shadow-[0_1px_2px_rgba(44,24,16,0.06),0_4px_14px_rgba(44,24,16,0.06)] transition duration-150 [transition-property:transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(44,24,16,0.1)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-success">
              Comunidade
            </span>
            <span className="flex w-full items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                <WhatsAppIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-extrabold text-coffee">
                  Entre no grupo do WhatsApp
                </span>
                <span className="block text-[13px] leading-snug text-coffee-soft">
                  Receba avisos de abertura e encerramento das encomendas, bastidores e
                  novidades.
                </span>
              </span>
              <ArrowIcon className="shrink-0 text-coffee-soft/50 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </a>
          <p className="mt-1.5 px-1 text-[12px] leading-snug text-coffee-soft/80">
            Os avisos chegam no grupo. Os pedidos são feitos pelo site.
          </p>
        </div>

        <div className={reducedMotion ? "" : "links-reveal"} style={revealStyle(5)}>
          <a
            href={LINKS_PAGE_URLS.instagram}
            target="_blank"
            rel="noreferrer"
            className="group flex min-h-[64px] w-full items-center gap-3 rounded-[20px] px-5 py-3.5 text-left transition duration-150 [transition-property:transform,background-color] hover:bg-white active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange-dark">
              <InstagramIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-extrabold uppercase tracking-wide text-coffee-soft/70">
                Redes sociais
              </span>
              <span className="block text-[15px] font-bold text-coffee">Siga e marque a Franck&rsquo;s</span>
              <span className="block text-[13px] leading-snug text-coffee-soft">
                Postou seu burger? Marque @francksburger.
              </span>
            </span>
            <ArrowIcon className="shrink-0 text-coffee-soft/40 transition-transform duration-150 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      <section className={reducedMotion ? "mt-8" : "links-reveal mt-8"} style={revealStyle(6)}>
        <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-coffee-soft">
          Como funciona
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          <Step n={1} title="Confira a edição">
            Veja no site a data de preparo e o prazo para encomendar.
          </Step>
          <Step n={2} title="Faça seu pedido">
            Escolha o burger e as opções disponíveis.
          </Step>
          <Step n={3} title="Receba em casa">
            A entrega acontece na data e na janela escolhidas.
          </Step>
        </ol>
      </section>

      <footer className={reducedMotion ? "mt-10 flex flex-col items-center gap-2 text-center" : "links-reveal mt-10 flex flex-col items-center gap-2 text-center"} style={revealStyle(7)}>
        <Logo size={28} />
        <p className="text-[12px] font-semibold text-coffee-soft">Franck&rsquo;s Burger · Uraí, PR</p>
      </footer>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={() => setAnimEnabled((v) => !v)}
          className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-coffee-soft/70 underline decoration-dotted underline-offset-2 transition hover:text-coffee-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
        >
          {reducedMotion
            ? "Animações desativadas pelo sistema"
            : animEnabled
              ? "Pausar animações"
              : "Ativar animações"}
        </button>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-soft text-[12px] font-extrabold text-orange-dark">
        {n}
      </span>
      <span>
        <span className="block text-[14px] font-bold text-coffee">{title}</span>
        <span className="block text-[13px] leading-snug text-coffee-soft">{children}</span>
      </span>
    </li>
  );
}

function Steam({ active, seed }: { active: boolean; seed: number }) {
  const durations = [5.4, 6.2, 6.8];
  const delays = [0, 1.6, 3.1];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 -top-2 z-0 flex justify-center"
      aria-hidden
    >
      {[0, 1].map((wisp) => (
        <div
          key={wisp}
          className="links-steam mx-0.5 h-11 w-2.5 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.55), rgba(255,255,255,0) 72%)",
            animationPlayState: active ? "running" : "paused",
            opacity: active ? undefined : 0,
            ["--steam-duration" as string]: `${durations[(seed + wisp) % durations.length]}s`,
            ["--steam-delay" as string]: `${delays[(seed + wisp) % delays.length]}s`,
          }}
        />
      ))}
    </div>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.33 4.95L2 22l5.24-1.37a9.9 9.9 0 0 0 4.8 1.22h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2Zm5.8 14.24c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.41-.13-.95-.31-1.63-.6-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.17-1.56-1.17-2.98 0-1.42.74-2.11 1-2.4.26-.29.57-.36.76-.36h.55c.18 0 .42-.03.65.5.25.55.83 2 .9 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.06.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.28.14.47.21.54.33.07.12.07.68-.17 1.36Z" />
    </svg>
  );
}
