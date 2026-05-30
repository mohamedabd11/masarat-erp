import { NextResponse } from 'next/server';
import { registerAgencyAction } from '@/actions/agencies';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+\d\s\-()]{7,20}$/;

interface RegisterBody {
  agencyNameAr: string;
  agencyNameEn?: string;
  adminEmail: string;
  adminNameAr: string;
  adminNameEn?: string;
  adminMobile?: string;
}

export async function POST(request: Request): Promise<Response> {
  // Rate limiting: 5 تسجيلات/ساعة لكل IP
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, 'register');
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'محاولات كثيرة جداً. يرجى الانتظار قبل المحاولة مجدداً.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const { agencyNameAr, agencyNameEn, adminEmail, adminNameAr, adminNameEn, adminMobile } = body;
  const email = adminEmail?.trim().toLowerCase();
  const errors: string[] = [];

  if (!agencyNameAr?.trim()) errors.push('اسم الوكالة بالعربي مطلوب');
  else if (agencyNameAr.trim().length > 200) errors.push('اسم الوكالة بالعربي طويل جداً');

  if (!adminNameAr?.trim()) errors.push('اسم المدير بالعربي مطلوب');
  else if (adminNameAr.trim().length > 100) errors.push('اسم المدير بالعربي طويل جداً');

  if (!email) errors.push('البريد الإلكتروني مطلوب');
  else if (!EMAIL_RE.test(email)) errors.push('صيغة البريد الإلكتروني غير صحيحة');
  else if (email.length > 254) errors.push('البريد الإلكتروني طويل جداً');

  if (adminMobile?.trim() && !PHONE_RE.test(adminMobile.trim())) {
    errors.push('رقم الهاتف غير صالح');
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }

  const result = await registerAgencyAction({
    agencyNameAr: agencyNameAr.trim(),
    agencyNameEn: agencyNameEn?.trim() || agencyNameAr.trim(),
    adminEmail: email,
    adminNameAr: adminNameAr.trim(),
    adminNameEn: adminNameEn?.trim() || adminNameAr.trim(),
    adminMobile: adminMobile?.trim() || '',
  });

  if (!result.success) {
    const status = result.error.includes('مسجّل مسبقاً') ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { agencyId: result.data.agencyId, setupLink: result.data.setupLink },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
