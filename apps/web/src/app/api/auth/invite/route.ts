import { NextResponse } from 'next/server';
import { inviteUserAction } from '@/actions/agencies';
import { extractBearerToken } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type UserRole = 'admin' | 'agent' | 'accountant' | 'viewer';

interface InviteBody {
  email: string;
  nameAr: string;
  nameEn?: string;
  mobile?: string;
  role: UserRole;
}

export async function POST(request: Request): Promise<Response> {
  // Rate limiting: 10 دعوات/ساعة
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, 'invite');
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'محاولات كثيرة جداً. يرجى الانتظار قبل المحاولة مجدداً.' },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  let idToken: string;
  try {
    idToken = extractBearerToken(request);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
  }

  const { nameAr, nameEn, mobile, role } = body;
  const email = body.email?.trim().toLowerCase();
  const VALID_ROLES: UserRole[] = ['admin', 'agent', 'accountant', 'viewer'];

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 });
  }
  if (!nameAr?.trim()) {
    return NextResponse.json({ error: 'اسم المستخدم مطلوب' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'الدور الوظيفي غير صالح' }, { status: 400 });
  }

  const result = await inviteUserAction(idToken, {
    email,
    nameAr: nameAr.trim(),
    nameEn: nameEn?.trim() || nameAr.trim(),
    mobile: mobile?.trim() || '',
    role,
  });

  if (!result.success) {
    const status = result.error.includes('مسجّل مسبقاً') ? 409
      : result.error.includes('Unauthorized') || result.error.includes('PERMISSION') ? 403
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    { userId: result.data.userId, setupLink: result.data.setupLink },
    { headers: rateLimitHeaders(rateLimit) }
  );
}
