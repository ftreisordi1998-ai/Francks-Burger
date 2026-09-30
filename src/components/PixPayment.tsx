"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildPixPayload } from "@/lib/pix";

export function PixPayment({
  pixKey,
  recipientName,
  city,
  amountCents,
  txid,
}: {
  pixKey: string;
  recipientName: string;
  city: string;
  amountCents: number;
  txid: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const code = buildPixPayload({
        key: pixKey,
        merchantName: recipientName,
        merchantCity: city,
        amountCents,
        txid,
      });
      setPayload(code);
      QRCode.toDataURL(code, { margin: 1, width: 240 }).then((url) => {
        if (!cancelled) setQrDataUrl(url);
      });
    } catch {
      setPayload(null);
    }
    return () => {
      cancelled = true;
    };
  }, [pixKey, recipientName, city, amountCents, txid]);

  async function handleCopy() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard unavailable — the code is still selectable as text
    }
  }

  if (!payload) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl}
          alt="QR Code Pix"
          width={180}
          height={180}
          className="rounded-2xl bg-white p-2 shadow-sm"
        />
      )}
      <p className="text-center text-xs text-coffee-soft">
        Aponte a câmera do celular para o QR Code, ou copie o código abaixo e cole no app do seu
        banco.
      </p>
      <button
        onClick={handleCopy}
        className="w-full rounded-xl bg-orange py-3 text-sm font-bold text-white transition active:scale-[0.98]"
      >
        {copied ? "Código copiado!" : "Copiar código Pix"}
      </button>
    </div>
  );
}
