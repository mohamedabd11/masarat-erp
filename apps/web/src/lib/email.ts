/**
 * Email service — uses Resend (RESEND_API_KEY must be set in env).
 * Agency SMTP support requires: pnpm add --filter @masarat/web nodemailer @types/nodemailer
 */

export interface EmailAttachment {
  filename: string;
  content:  Uint8Array;
  mimeType: string;
}

export interface SendEmailOptions {
  to:           string;
  subject:      string;
  html:         string;
  text?:        string;
  from?:        string;    // "Name <addr>" — defaults to RESEND_FROM_EMAIL env
  attachments?: EmailAttachment[];
}

export interface AgencySmtp {
  host:       string;
  port:       number;
  user:       string;
  password:   string;
  fromName:   string | null;
  fromEmail:  string;
  encryption: string;   // 'tls' | 'ssl' | 'none'
}

export interface EmailResult {
  ok:     boolean;
  error?: string;
}

// ── Resend ────────────────────────────────────────────────────────────────────

async function sendViaResend(opts: SendEmailOptions): Promise<EmailResult> {
  const apiKey  = process.env['RESEND_API_KEY'];
  const fromEnv = process.env['RESEND_FROM_EMAIL'] ?? 'noreply@masarat.app';
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const payload: Record<string, unknown> = {
    from:    opts.from ?? fromEnv,
    to:      [opts.to],
    subject: opts.subject,
    html:    opts.html,
  };
  if (opts.text) payload['text'] = opts.text;

  if (opts.attachments?.length) {
    payload['attachments'] = opts.attachments.map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.content).toString('base64'),
    }));
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Resend API error ${res.status}: ${body}` };
  }
  return { ok: true };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendEmail(
  opts: SendEmailOptions,
  _agencySmtp?: AgencySmtp | null,
): Promise<EmailResult> {
  // TODO: when nodemailer is installed, prefer agencySmtp if fully configured.
  // For now always route through Resend.
  return sendViaResend(opts);
}

// ── Invoice email builder ─────────────────────────────────────────────────────

export interface InvoiceEmailData {
  invoiceNumber: string;
  buyerName:     string;
  agencyNameAr:  string;
  totalSar:      string;
  issueDate:     string;
  locale?:       'ar' | 'en';
}

export function buildInvoiceEmailHtml(d: InvoiceEmailData): string {
  const isAr  = (d.locale ?? 'ar') === 'ar';
  const dir   = isAr ? 'rtl' : 'ltr';
  const title = isAr
    ? `فاتورة ضريبية رقم ${d.invoiceNumber}`
    : `Tax Invoice #${d.invoiceNumber}`;
  const body  = isAr
    ? `مرحباً ${d.buyerName}،<br/><br/>يسعدنا إرسال فاتورتك من <strong>${d.agencyNameAr}</strong>.<br/>
       <strong>رقم الفاتورة:</strong> ${d.invoiceNumber}<br/>
       <strong>تاريخ الإصدار:</strong> ${d.issueDate}<br/>
       <strong>الإجمالي:</strong> ${d.totalSar}<br/><br/>
       يُرجى مراجعة الفاتورة المرفقة.`
    : `Hello ${d.buyerName},<br/><br/>Please find your invoice from <strong>${d.agencyNameAr}</strong> attached.<br/>
       <strong>Invoice #:</strong> ${d.invoiceNumber}<br/>
       <strong>Date:</strong> ${d.issueDate}<br/>
       <strong>Total:</strong> ${d.totalSar}`;

  return `<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${dir}">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e7eb;">
    <div style="border-bottom:2px solid #1a56db;padding-bottom:16px;margin-bottom:24px;">
      <h2 style="margin:0;color:#1a56db;">${d.agencyNameAr}</h2>
    </div>
    <h3 style="color:#111827;">${title}</h3>
    <p style="color:#374151;line-height:1.6;">${body}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
    <p style="color:#6b7280;font-size:12px;">
      ${isAr ? 'هذه رسالة آلية، يرجى عدم الرد عليها.' : 'This is an automated message. Please do not reply.'}
    </p>
  </div>
</body>
</html>`;
}
