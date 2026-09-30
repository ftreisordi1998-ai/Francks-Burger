// Gera o "Pix Copia e Cola" (BR Code) seguindo o padrão EMV do Banco Central.
// Referência pública: Manual de Padrões para Iniciação do Pix (Bacen/EMVCo).

function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

function sanitize(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixPayloadInput {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid?: string;
}

export function buildPixPayload({
  key,
  merchantName,
  merchantCity,
  amountCents,
  txid,
}: PixPayloadInput): string {
  const merchantAccountInfo = tlv("00", "br.gov.bcb.pix") + tlv("01", key.trim());
  const amount = (amountCents / 100).toFixed(2);
  const referenceLabel = sanitize(txid || "FRANCKSBURGER", 25) || "***";

  const fields =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", "11") + // Point of Initiation Method (11 = estático)
    tlv("26", merchantAccountInfo) + // Merchant Account Information (Pix)
    tlv("52", "0000") + // Merchant Category Code
    tlv("53", "986") + // Currency: BRL
    tlv("54", amount) + // Transaction Amount
    tlv("58", "BR") + // Country
    tlv("59", sanitize(merchantName, 25) || "FRANCKS BURGER") + // Merchant Name
    tlv("60", sanitize(merchantCity, 15) || "SAO PAULO") + // Merchant City
    tlv("62", tlv("05", referenceLabel)); // Additional Data Field (txid)

  const withCrcPlaceholder = `${fields}6304`;
  return `${withCrcPlaceholder}${crc16(withCrcPlaceholder)}`;
}
