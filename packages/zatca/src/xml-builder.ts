/**
 * @masarat/zatca — UBL 2.1 XML Builder
 *
 * يبني XML الفاتورة الإلكترونية وفق مواصفات ZATCA المرحلة الثانية.
 * المرجع: ZATCA e-invoicing Implementation Standards v3.x
 *
 * ملاحظة: هذا الملف يعمل في Cloud Functions (Node.js) فقط.
 * التوقيع (ECDSA) يتطلب المفتاح الخاص الذي لا يُرسَل للـ Client أبداً.
 */

import type { ZatcaInvoice, ZatcaVatCategory, ZatcaExemptionReason } from './types';

const SAR_TO_DECIMAL = 100; // تحويل الهللات لريال (قسمة على 100)

/** يحوّل هللات لنص بصيغة الريال ذات منزلتين عشريتين */
function hal(halalas: number): string {
  return (halalas / SAR_TO_DECIMAL).toFixed(2);
}

/** يُنسَّق التاريخ بصيغة ISO 8601 لـ ZATCA */
function formatDateTime(date: Date): { dateStr: string; timeStr: string } {
  const iso = date.toISOString();
  return {
    dateStr: iso.split('T')[0]!,
    timeStr: iso.split('T')[1]!.replace('Z', '+03:00'), // توقيت الرياض
  };
}

/** خريطة أكواد سبب الإعفاء لـ UBL */
const EXEMPTION_SCHEME = 'urn:un:unece:uncefact:codelist:standard:UNECE:TaxExemptionReason:D16B';

function buildVatCategory(
  category: ZatcaVatCategory,
  rate: number,
  exemptionReason: ZatcaExemptionReason | undefined
): string {
  const ratePercent = (rate * 100).toFixed(2);
  const exemptionBlock = exemptionReason
    ? `
        <cbc:TaxExemptionReasonCode>${exemptionReason}</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason schemeID="${EXEMPTION_SCHEME}">${exemptionReason}</cbc:TaxExemptionReason>`
    : '';

  return `
        <cac:TaxCategory>
          <cbc:ID>${category}</cbc:ID>
          <cbc:Percent>${ratePercent}</cbc:Percent>${exemptionBlock}
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>`;
}

/**
 * يبني XML كامل لفاتورة ZATCA وفق UBL 2.1
 * القيمة المُعادة تحتاج للتوقيع الرقمي قبل الإرسال لـ ZATCA.
 *
 * @param icv  قيمة عدّاد الفاتورة ICV (تسلسلي لكل وكالة). عند غيابها تُستخرج
 *             من رقم الفاتورة — لكن العدّاد الصريح هو الصحيح لأن أرقام
 *             الفواتير تُعاد سنوياً بينما ICV يجب أن يبقى تصاعدياً دائماً.
 */
export function buildInvoiceXml(invoice: ZatcaInvoice, previousHash: string, icv?: number): string {
  const { dateStr, timeStr } = formatDateTime(invoice.issueDateTime);

  // subtype codes (BR-KSA-06): 01xxxxx = فاتورة قياسية (B2B — clearance)
  //                            02xxxxx = فاتورة مبسطة (B2C — reporting)
  const subtypeCode = invoice.transactionType === 'B2B' ? '0100000' : '0200000';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <!-- ── Extensions للتوقيع الرقمي XAdES B-B ──
       تُستبدل القيم المولّدة (hash/توقيع/شهادة/وقت) محل العناصر النائبة
       في signInvoiceXml() — لا تذكر أسماءها هنا حرفياً لئلا تُستبدل في التعليق -->
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2"
                                   xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2"
                                   xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">
              <ds:SignedInfo>
                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>
                <ds:Reference Id="invoiceSignedData" URI="">
                  <ds:Transforms>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>
                    </ds:Transform>
                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
                  </ds:Transforms>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>{{INVOICE_HASH}}</ds:DigestValue>
                </ds:Reference>
                <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>{{SIGNED_PROPERTIES_HASH}}</ds:DigestValue>
                </ds:Reference>
              </ds:SignedInfo>
              <ds:SignatureValue>{{DIGITAL_SIGNATURE}}</ds:SignatureValue>
              <ds:KeyInfo>
                <ds:X509Data>
                  <ds:X509Certificate>{{CERTIFICATE}}</ds:X509Certificate>
                </ds:X509Data>
              </ds:KeyInfo>
              <ds:Object>
                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
                  <xades:SignedProperties Id="xadesSignedProperties">
                    <xades:SignedSignatureProperties>
                      <xades:SigningTime>{{SIGNING_TIME}}</xades:SigningTime>
                      <xades:SigningCertificate>
                        <xades:Cert>
                          <xades:CertDigest>
                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                            <ds:DigestValue>{{CERT_DIGEST}}</ds:DigestValue>
                          </xades:CertDigest>
                          <xades:IssuerSerial>
                            <ds:X509IssuerName>{{CERT_ISSUER}}</ds:X509IssuerName>
                            <ds:X509SerialNumber>{{CERT_SERIAL}}</ds:X509SerialNumber>
                          </xades:IssuerSerial>
                        </xades:Cert>
                      </xades:SigningCertificate>
                    </xades:SignedSignatureProperties>
                  </xades:SignedProperties>
                </xades:QualifyingProperties>
              </ds:Object>
            </ds:Signature>
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <!-- ── البيانات الأساسية ── -->
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${invoice.uuid}</cbc:UUID>
  <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  <cbc:IssueTime>${timeStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${subtypeCode}">${invoice.invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:Note languageID="ar">فاتورة ضريبية</cbc:Note>
  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${invoice.currency}</cbc:TaxCurrencyCode>

  ${invoice.originalInvoiceUUID ? `<!-- ── مرجع الفاتورة الأصلية (إلزامي للإشعارات 381/383 — BR-KSA-56) ── -->
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(invoice.originalInvoiceNumber ?? invoice.originalInvoiceUUID)}</cbc:ID>
      <cbc:UUID>${invoice.originalInvoiceUUID}</cbc:UUID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  ` : ''}<!-- ── Hash الفاتورة السابقة (للتسلسل) ── -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${icv ?? extractCounter(invoice.invoiceNumber)}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${previousHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <!-- ── التوقيع المرجعي ── -->
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>

  <!-- ── البائع ── -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(invoice.seller.crNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.seller.address.streetName)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(invoice.seller.address.buildingNumber)}</cbc:BuildingNumber>
        <cbc:PlotIdentification>${escapeXml(invoice.seller.address.additionalNumber ?? '')}</cbc:PlotIdentification>
        <cbc:CitySubdivisionName>${escapeXml(invoice.seller.address.district)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(invoice.seller.address.city)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(invoice.seller.address.postalCode)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${invoice.seller.address.countryCode}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${invoice.seller.vatNumber}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.seller.nameAr)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- ── المشتري ── -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:CityName>${escapeXml(invoice.buyer.address?.city ?? '')}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>${invoice.buyer.address?.countryCode ?? 'SA'}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      ${invoice.buyer.vatNumber ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${invoice.buyer.vatNumber}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- ── الضريبة الإجمالية ── -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${hal(invoice.totals.totalVat)}</cbc:TaxAmount>
    ${invoice.totals.vatBreakdown.map(vb => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${hal(vb.taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${hal(vb.vatAmount)}</cbc:TaxAmount>
      ${buildVatCategory(vb.category, vb.taxableAmount > 0 ? vb.vatAmount / vb.taxableAmount : 0, vb.exemptionReason)}
    </cac:TaxSubtotal>`).join('')}
  </cac:TaxTotal>

  <!-- ── الإجماليات ── -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${hal(invoice.totals.subtotalExclVat)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${hal(invoice.totals.subtotalExclVat)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${hal(invoice.totals.grandTotal)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">0.00</cbc:AllowanceTotalAmount>
    <cbc:PrepaidAmount currencyID="SAR">0.00</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="SAR">${hal(invoice.totals.grandTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- ── البنود ── -->
  ${invoice.lines.map((line, idx) => `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${hal(line.totalPriceExclVat)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${hal(line.vatAmount)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${hal(line.totalPriceExclVat + line.vatAmount)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${line.vatCategory}</cbc:ID>
        <cbc:Percent>${(line.vatRate * 100).toFixed(2)}</cbc:Percent>
        ${line.exemptionReason ? `<cbc:TaxExemptionReasonCode>${line.exemptionReason}</cbc:TaxExemptionReasonCode>` : ''}
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${hal(line.unitPriceExclVat)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="${line.unitCode}">1</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`).join('')}

</Invoice>`;

  return xml.trim();
}

/** يُهرِّب محارف XML الخاصة */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** يستخرج رقم الفاتورة من الكود (INV-2026-001547 → 1547) */
function extractCounter(invoiceNumber: string): string {
  const parts = invoiceNumber.split('-');
  return parts[parts.length - 1] ?? '1';
}
