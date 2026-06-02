/**
 * ZATCA Phase 1 QR Code — TLV/Base64 encoding
 * Spec: ZATCA e-Invoice Implementation Standards v2.3, Annex H
 */

function tlvField(tag: number, value: string): Uint8Array {
  const valueBytes = new TextEncoder().encode(value);
  const result = new Uint8Array(2 + valueBytes.length);
  result[0] = tag;
  result[1] = valueBytes.length;
  result.set(valueBytes, 2);
  return result;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const arr of arrays) { out.set(arr, offset); offset += arr.length; }
  return out;
}

function halalasToSar(halalas: number): string {
  return (halalas / 100).toFixed(2);
}

export interface ZatcaQrInput {
  sellerName:    string;   // agency nameAr or nameEn
  vatNumber:     string;   // agency vatNumber
  invoiceDate:   string;   // YYYY-MM-DD
  totalHalalas:  number;   // total including VAT in halalas
  vatHalalas:    number;   // VAT amount in halalas
}

export function buildZatcaQr(input: ZatcaQrInput): string {
  const timestamp = `${input.invoiceDate}T00:00:00Z`;
  const tlv = concat(
    tlvField(1, input.sellerName),
    tlvField(2, input.vatNumber),
    tlvField(3, timestamp),
    tlvField(4, halalasToSar(input.totalHalalas)),
    tlvField(5, halalasToSar(input.vatHalalas)),
  );
  // btoa works in both Node 18+ and Edge Runtime
  return btoa(String.fromCharCode(...tlv));
}
