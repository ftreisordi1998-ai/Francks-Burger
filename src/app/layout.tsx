import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CartProvider } from "@/lib/cart-context";
import { DialogProvider } from "@/lib/dialog-context";
import { MetaPixel } from "@/components/MetaPixel";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const title = "Franck's Burger — Burgers na brasa, por encomenda";
const description =
  "Encomende burgers artesanais feitos na churrasqueira por edição semanal limitada.";

export const metadata: Metadata = {
  metadataBase: new URL("https://francksburger.com.br"),
  title,
  description,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon-32.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title,
    description,
    url: "/",
    siteName: "Franck's Burger",
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Franck's Burger" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf3e3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-cream text-coffee">
        <MetaPixel />
        <GoogleAdsTag />
        <DialogProvider>
          <CartProvider>{children}</CartProvider>
        </DialogProvider>
      </body>
    </html>
  );
}
