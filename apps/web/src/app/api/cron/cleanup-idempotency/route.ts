/**
 * Cron: Cleanup expired idempotency keys
 * يُشغَّل كل 6 ساعات لتنظيف المفاتيح المنتهية الصلاحية
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('x-cron-secret') !== process.env['CRON_SECRET']) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cleanupExpiredKeys } = await import('@/lib/idempotency');
  const deleted = await cleanupExpiredKeys();

  return Response.json({ success: true, deleted });
}
