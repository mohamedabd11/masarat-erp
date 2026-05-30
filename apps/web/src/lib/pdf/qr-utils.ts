import QRCode from 'qrcode';

// ── ZATCA Phase-1 TLV encoder ─────────────────────────────────────────────
// Tags 1-5 are mandatory for Phase 1 simplified tax invoices.
// Phase 2 (tags 6-9) requires digital certificates issued by ZATCA — those
// are added when the agency configures its ZATCA certificate in the portal.

function tlv(tag: number, value: string): Uint8Array {
  const valueBytes = new TextEncoder().encode(value);
  const out = new Uint8Array(2 + valueBytes.length);
  out[0] = tag;
  out[1] = valueBytes.length;
  out.set(valueBytes, 2);
  return out;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function halToStr(h: number): string {
  return (h / 100).toFixed(2);
}

interface Phase1QrInput {
  sellerName:    string;
  vatNumber:     string;
  issueDateTime: Date;
  totalHalalas:  number;
  vatHalalas:    number;
}

function buildPhase1TlvBase64(input: Phase1QrInput): string {
  const isoTs = input.issueDateTime.toISOString().replace('Z', '+03:00');
  const parts = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, isoTs),
    tlv(4, halToStr(input.totalHalalas)),
    tlv(5, halToStr(input.vatHalalas)),
  ];
  const bytes = concat(parts);
  return Buffer.from(bytes).toString('base64');
}

/** Returns a PNG data URL suitable for embedding in a react-pdf <Image> */
export async function buildZatcaQrDataUrl(input: Phase1QrInput): Promise<string> {
  const tlvBase64 = buildPhase1TlvBase64(input);
  return QRCode.toDataURL(tlvBase64, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 120,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
