/**
 * @masarat/zatca — QR Code Generator (TLV Encoding)
 *
 * يُولِّد بيانات QR Code وفق مواصفات ZATCA (TLV — Tag-Length-Value).
 * القيمة المُعادة (Base64) تُرسَم كـ QR Code في الفاتورة المطبوعة.
 *
 * Tags الإلزامية (المرحلة الثانية):
 *   1 = اسم البائع
 *   2 = الرقم الضريبي للبائع
 *   3 = وقت إصدار الفاتورة
 *   4 = إجمالي الفاتورة شامل الضريبة
 *   5 = إجمالي الضريبة
 *   6 = hash الفاتورة
 *   7 = التوقيع الرقمي (ECDSA)
 *   8 = المفتاح العام للشهادة
 *   9 = توقيع الشهادة
 */

export interface QrCodeInput {
  sellerName: string;        // اسم البائع (عربي)
  vatNumber: string;         // الرقم الضريبي (15 خانة)
  issueDateTime: Date;       // وقت الإصدار
  totalWithVat: number;      // الإجمالي شامل VAT (بالهللات)
  vatAmount: number;         // مبلغ الضريبة (بالهللات)
  invoiceHash: string;       // SHA-256 بصيغة Base64
  digitalSignature: string;  // ECDSA بصيغة Base64
  publicKey: string;         // المفتاح العام للشهادة (Base64)
  certificateSignature: string; // توقيع الشهادة (Base64)
}

/**
 * يُشفِّر قيمة TLV بصيغة ZATCA.
 * TLV = Tag (1 byte) + Length (1 byte) + Value (n bytes)
 */
function encodeTlv(tag: number, value: string): Uint8Array {
  const valueBytes = new TextEncoder().encode(value);
  const tlv = new Uint8Array(2 + valueBytes.length);
  tlv[0] = tag;
  tlv[1] = valueBytes.length;
  tlv.set(valueBytes, 2);
  return tlv;
}

function encodeTlvBytes(tag: number, valueBytes: Uint8Array): Uint8Array {
  const tlv = new Uint8Array(2 + valueBytes.length);
  tlv[0] = tag;
  tlv[1] = valueBytes.length;
  tlv.set(valueBytes, 2);
  return tlv;
}

/** يدمج مصفوفات Uint8Array */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** يحوّل الهللات لنص ريال بمنزلتين عشريتين */
function halToStr(halalas: number): string {
  return (halalas / 100).toFixed(2);
}

/**
 * يُولِّد بيانات QR Code بصيغة Base64.
 * هذه القيمة تُستخدم مباشرة لرسم QR Code في الفاتورة.
 */
export function generateQrCodeData(input: QrCodeInput): string {
  const isoDateTime = input.issueDateTime.toISOString().replace('Z', '+03:00');

  // فك تشفير Base64 للقيم الثنائية
  const hashBytes = base64ToUint8Array(input.invoiceHash);
  const sigBytes = base64ToUint8Array(input.digitalSignature);
  const pubKeyBytes = base64ToUint8Array(input.publicKey);
  const certSigBytes = base64ToUint8Array(input.certificateSignature);

  const tlvParts = [
    encodeTlv(1, input.sellerName),                // Tag 1: اسم البائع
    encodeTlv(2, input.vatNumber),                  // Tag 2: الرقم الضريبي
    encodeTlv(3, isoDateTime),                      // Tag 3: وقت الإصدار
    encodeTlv(4, halToStr(input.totalWithVat)),     // Tag 4: الإجمالي
    encodeTlv(5, halToStr(input.vatAmount)),        // Tag 5: الضريبة
    encodeTlvBytes(6, hashBytes),                   // Tag 6: Hash الفاتورة
    encodeTlvBytes(7, sigBytes),                    // Tag 7: التوقيع الرقمي
    encodeTlvBytes(8, pubKeyBytes),                 // Tag 8: المفتاح العام
    encodeTlvBytes(9, certSigBytes),                // Tag 9: توقيع الشهادة
  ];

  const combined = concatUint8Arrays(tlvParts);
  return uint8ArrayToBase64(combined);
}

/**
 * يتحقق من صحة بيانات QR Code (للاختبار).
 * يُفكِّك البيانات ويُعيد Tags المُشفَّرة.
 */
export function decodeQrCodeData(base64: string): Record<number, string> {
  const bytes = base64ToUint8Array(base64);
  const result: Record<number, string> = {};
  let offset = 0;

  while (offset < bytes.length) {
    const tag = bytes[offset]!;
    const length = bytes[offset + 1]!;
    const value = bytes.slice(offset + 2, offset + 2 + length);

    // Tags 1-5 نصية، الباقي ثنائي
    if (tag <= 5) {
      result[tag] = new TextDecoder().decode(value);
    } else {
      result[tag] = uint8ArrayToBase64(value);
    }

    offset += 2 + length;
  }

  return result;
}

// ─── دوال مساعدة ─────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
