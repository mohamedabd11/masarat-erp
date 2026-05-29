import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { Resend } from 'resend';

interface Body {
  email:   string;
  locale?: string;
}

function htmlAr(resetUrl: string) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center">
          <div style="display:inline-block;background:rgba(255,255,255,.15);border-radius:12px;padding:12px 24px">
            <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1px">مسارات</span>
            <div style="color:#93c5fd;font-size:11px;margin-top:2px">نظام إدارة وكالات السفر</div>
          </div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 40px 32px">
          <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">إعادة تعيين كلمة المرور</h2>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7">
            تلقّينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في مسارات.
            اضغط على الزر أدناه لإنشاء كلمة مرور جديدة.
          </p>

          <div style="text-align:center;margin:32px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:700">
              إعادة تعيين كلمة المرور
            </a>
          </div>

          <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6">
            إذا لم يعمل الزر، انسخ هذا الرابط وافتحه في المتصفح:
          </p>
          <p style="margin:0 0 24px;word-break:break-all;font-size:12px;color:#94a3b8;font-family:monospace">${resetUrl}</p>

          <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px">
            <p style="margin:0;color:#92400e;font-size:13px">
              ⚠️ صلاحية هذا الرابط تنتهي خلال ساعة واحدة. إذا لم تطلب إعادة التعيين، تجاهل هذا الإيميل.
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f1f5f9;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">نظام مسارات © 2026 — جميع الحقوق محفوظة</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function htmlEn(resetUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Tahoma,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

        <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center">
          <div style="display:inline-block;background:rgba(255,255,255,.15);border-radius:12px;padding:12px 24px">
            <span style="color:#ffffff;font-size:22px;font-weight:800">Masarat</span>
            <div style="color:#93c5fd;font-size:11px;margin-top:2px">Travel Agency Management</div>
          </div>
        </td></tr>

        <tr><td style="padding:40px 40px 32px">
          <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">Reset your password</h2>
          <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.7">
            We received a request to reset the password for your Masarat account.
            Click the button below to create a new password.
          </p>

          <div style="text-align:center;margin:32px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:700">
              Reset Password
            </a>
          </div>

          <p style="margin:0 0 8px;color:#64748b;font-size:13px">If the button doesn't work, copy this link:</p>
          <p style="margin:0 0 24px;word-break:break-all;font-size:12px;color:#94a3b8;font-family:monospace">${resetUrl}</p>

          <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px">
            <p style="margin:0;color:#92400e;font-size:13px">
              ⚠️ This link expires in 1 hour. If you didn't request this, ignore this email.
            </p>
          </div>
        </td></tr>

        <tr><td style="background:#f1f5f9;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;color:#94a3b8;font-size:12px">Masarat ERP © 2026 — All rights reserved</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    const email  = (body.email ?? '').trim().toLowerCase();
    const locale = body.locale ?? 'ar';
    const isAr   = locale === 'ar';

    if (!email) return NextResponse.json({ success: true }); // don't reveal

    ensureAdminApp();
    const { getAuth } = await import('firebase-admin/auth');
    const auth   = getAuth();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://masarat-erp.com').replace(/\/$/, '');

    // Generate Firebase link → extract oobCode → build custom URL
    const firebaseLink = await auth.generatePasswordResetLink(email, {
      url: `${appUrl}/${locale}/login`,
    });

    const oobCode  = new URL(firebaseLink).searchParams.get('oobCode') ?? '';
    const resetUrl = `${appUrl}/${locale}/auth/action?mode=resetPassword&oobCode=${oobCode}`;

    // Send via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    'مسارات <noreply@masarat-erp.com>',
      to:      email,
      subject: isAr ? 'إعادة تعيين كلمة المرور — مسارات' : 'Reset your password — Masarat',
      html:    isAr ? htmlAr(resetUrl) : htmlEn(resetUrl),
    });

  } catch {
    // Intentionally swallow all errors — never reveal whether an email exists
  }

  return NextResponse.json({ success: true });
}
