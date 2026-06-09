import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documents, groupTrips, bookings } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

const VALID_ENTITY_TYPES = new Set(['booking', 'group_trip', 'customer', 'supplier']);
const MAX_FILE_SIZE      = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'تخزين الملفات غير مهيأ' }, { status: 503 });
    }

    const form = await req.formData();
    const file       = form.get('file')       as File   | null;
    const entityType = form.get('entityType') as string | null;
    const entityId   = form.get('entityId')   as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'الملف مطلوب' }, { status: 400 });
    }
    if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json({ error: 'نوع الكيان غير صالح' }, { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json({ error: 'معرّف الكيان مطلوب' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'حجم الملف يتجاوز 20 ميجابايت' }, { status: 400 });
    }

    // Verify the entity belongs to this agency
    if (entityType === 'group_trip') {
      const [trip] = await db.select({ id: groupTrips.id })
        .from(groupTrips)
        .where(and(eq(groupTrips.id, entityId), eq(groupTrips.agencyId, agencyId)));
      if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    } else if (entityType === 'booking') {
      const [booking] = await db.select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, entityId), eq(bookings.agencyId, agencyId)));
      if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const blobPath = `${agencyId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName}`;

    const blob = await put(blobPath, file, {
      access: 'public',
      token:  process.env.BLOB_READ_WRITE_TOKEN,
    });

    const now = new Date();
    const [doc] = await db.insert(documents).values({
      id:         crypto.randomUUID(),
      agencyId,
      entityType,
      entityId,
      fileName:   file.name,
      fileUrl:    blob.url,
      fileSize:   file.size,
      mimeType:   file.type || null,
      uploadedBy: uid,
      createdAt:  now,
    }).returning();

    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'document_upload_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
