"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { gtagEvent } from "@/lib/gtag";

const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

export function GoogleAdsTag() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!ADS_ID) return;
    // A tag base já manda o page_view inicial sozinha — aqui só cobre as
    // trocas de página seguintes (navegação client-side do Next.js).
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    gtagEvent("page_view", { page_path: pathname });
  }, [pathname]);

  if (!ADS_ID) return null;

  return (
    <>
      <Script
        id="google-ads-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
      />
      <Script id="google-ads-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${ADS_ID}');
        `}
      </Script>
    </>
  );
}
