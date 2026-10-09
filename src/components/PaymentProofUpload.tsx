"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]/g, "_")
    .slice(-80);
}

export function PaymentProofUpload({
  publicToken,
  onSubmitted,
}: {
  publicToken: string;
  onSubmitted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(picked.type)) {
      setError("Formato não suportado. Envie uma imagem (JPG, PNG, WEBP) ou um PDF.");
      return;
    }
    if (picked.size > MAX_SIZE_BYTES) {
      setError("O arquivo passou de 10 MB. Envie um arquivo menor.");
      return;
    }
    setFile(picked);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  async function handleUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const path = `${publicToken}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: rpcError } = await supabase.rpc("submit_payment_proof", {
        p_token: publicToken,
        p_storage_path: path,
        p_mime_type: file.type,
        p_size_bytes: file.size,
      });
      if (rpcError) throw rpcError;

      onSubmitted();
    } catch {
      setError("Não foi possível enviar o comprovante agora. Tente novamente em instantes.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl bg-white p-4">
      <h2 className="text-sm font-extrabold text-coffee">Já fez o Pix?</h2>
      <p className="mt-1 text-sm text-coffee-soft">
        Envie seu comprovante para conferirmos o pagamento da sua encomenda.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {!file ? (
        <button
          onClick={openPicker}
          className="mt-3 w-full rounded-xl bg-orange-soft py-3 text-sm font-bold text-orange-dark transition active:scale-[0.98]"
        >
          Anexar comprovante
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-cream-soft px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg">{file.type === "application/pdf" ? "📄" : "🖼️"}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-coffee">{file.name}</p>
                <p className="text-xs text-coffee-soft">{formatSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={openPicker}
              disabled={uploading}
              className="shrink-0 text-xs font-bold text-orange disabled:opacity-50"
            >
              Trocar
            </button>
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full rounded-xl bg-orange py-3 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            {uploading ? "Enviando…" : "Enviar comprovante"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-danger">{error}</p>}
      <p className="mt-2 text-xs text-coffee-soft/80">
        Imagem ou PDF, até 10 MB. No celular, você pode escolher um arquivo ou tirar uma foto na
        hora.
      </p>
    </section>
  );
}
