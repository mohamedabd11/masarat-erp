/**
 * Cron: Cleanup expired idempotency keys
 * يُشغَّل كل 6 ساعات لتنظيف المفاتيح المنتهية الصلاحية
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret || request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cleanupExpiredKeys } = await import('@/lib/idempotency');
  const deleted = await cleanupExpiredKeys();

  return Response.json({ success: true, deleted });
}
