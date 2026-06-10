'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip, Upload, Trash2, FileText, FileImage, File, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch, apiUpload } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DocItem {
  id:        string;
  fileName:  string;
  fileUrl:   string;
  fileSize:  number | null;
  mimeType:  string | null;
  createdAt: string;
}

interface DocumentsSectionProps {
  entityType: string;  // 'booking' | 'group_trip'
  entityId:   string;
  locale:     string;
  readOnly?:  boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  if (!mimeType) return <File size={16} className="text-slate-400" />;
  if (mimeType.startsWith('image/'))  return <FileImage size={16} className="text-brand-500" />;
  if (mimeType === 'application/pdf') return <FileText  size={16} className="text-red-500" />;
  return <File size={16} className="text-slate-400" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DocumentsSection({ entityType, entityId, locale, readOnly = false }: DocumentsSectionProps) {
  const isAr = locale === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs,        setDocs]        = useState<DocItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ documents: DocItem[] }>(
        `/api/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      );
      setDocs(data.documents);
    } catch {
      setError(isAr ? 'تعذّر تحميل المستندات' : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, isAr]);

  useEffect(() => { void load(); }, [load]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file',       file);
      form.append('entityType', entityType);
      form.append('entityId',   entityId);
      await apiUpload('/api/documents/upload', form);
      void load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : (isAr ? 'فشل الرفع' : 'Upload failed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: DocItem) {
    if (!confirm(isAr ? `هل تريد حذف "${doc.fileName}"؟` : `Delete "${doc.fileName}"?`)) return;
    setDeletingId(doc.id);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: 'DELETE' });
    } catch { /* silently reload */ }
    finally {
      setDeletingId(null);
      void load();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip size={16} className="text-brand-600" />
              {isAr
                ? `المستندات والمرفقات${docs.length > 0 ? ` (${docs.length})` : ''}`
                : `Documents & Attachments${docs.length > 0 ? ` (${docs.length})` : ''}`}
            </div>
            {!readOnly && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5"
                >
                  {uploading ? <Spinner size="sm" /> : <Upload size={13} />}
                  {isAr ? 'رفع ملف' : 'Upload'}
                </Button>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {uploadError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{uploadError}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Spinner size="sm" /></div>
      ) : error ? (
        <p className="text-sm text-red-500 text-center py-4">{error}</p>
      ) : docs.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm space-y-2">
          <Paperclip size={28} className="mx-auto opacity-30" />
          <p>{isAr ? 'لا توجد مستندات مرفقة' : 'No documents attached'}</p>
          {!readOnly && (
            <button
              className="text-brand-500 hover:text-brand-700 text-xs underline"
              onClick={() => fileInputRef.current?.click()}
            >
              {isAr ? 'ارفع أول ملف' : 'Upload the first file'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors"
            >
              <FileIcon mimeType={doc.mimeType} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</p>
                <p className="text-xs text-slate-400">
                  {formatFileSize(doc.fileSize)}
                  {doc.fileSize && doc.createdAt ? ' · ' : ''}
                  {formatDate(doc.createdAt, isAr ? 'ar-SA' : 'en-SA')}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-white transition-colors"
                  title={isAr ? 'فتح' : 'Open'}
                >
                  <ExternalLink size={14} />
                </a>
                {!readOnly && (
                  <button
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors"
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    title={isAr ? 'حذف' : 'Delete'}
                  >
                    {deletingId === doc.id ? <Spinner size="sm" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
