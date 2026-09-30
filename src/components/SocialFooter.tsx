const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/JtJTu8i71UZ2NUPneXuAmb?mode=gi_t";
const INSTAGRAM_URL = "https://www.instagram.com/francksburger/";

export function SocialFooter() {
  return (
    <footer className="mt-8 flex flex-col items-center gap-3 px-5 pb-6 text-center">
      <p className="flex items-center gap-1.5 text-sm font-medium text-coffee-soft">
        <PinIcon />
        Uraí, Paraná
      </p>
      <div className="flex items-center gap-3">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram do Franck's Burger"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-coffee shadow-sm transition active:scale-95"
        >
          <InstagramIcon />
        </a>
        <a
          href={WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center gap-2 rounded-full bg-success px-5 text-sm font-bold text-white shadow-sm transition active:scale-95"
        >
          <WhatsAppIcon />
          Entrar no grupo do WhatsApp
        </a>
      </div>
    </footer>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s7-7.16 7-12a7 7 0 1 0-14 0c0 4.84 7 12 7 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
