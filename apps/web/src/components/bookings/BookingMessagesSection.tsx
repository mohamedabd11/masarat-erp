'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { MESSAGE_TEMPLATES, getTemplate } from '@/lib/message-templates';
import type { CustomerMessage } from '@/lib/schema';
import { MessageSquare, Send, Copy, X, CheckCheck, Phone } from 'lucide-react';

interface Props {
  bookingId: string;
  bookingNumber: string;
  customerNameAr: string;
  customerPhone?: string | null;
  totalHalalas: number;
  paidHalalas: number;
  locale: string;
  isCancelled: boolean;
}

function halalasToSAR(halalas: number): string {
  return (halalas / 100).toFixed(2);
}

function phoneToWaNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

function channelLabel(channel: string, isAr: boolean): string {
  if (channel === 'whatsapp') return isAr ? 'واتساب' : 'WhatsApp';
  if (channel === 'copy')     return isAr ? 'نسخ' : 'Copied';
  return channel;
}

export function BookingMessagesSection({
  bookingId,
  bookingNumber,
  customerNameAr,
  customerPhone,
  totalHalalas,
  paidHalalas,
  locale,
  isCancelled,
}: Props) {
  const isAr = locale === 'ar';

  const [messages, setMessages]               = useState<CustomerMessage[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [showModal, setShowModal]             = useState(false);
  const [selectedKey, setSelectedKey]         = useState(MESSAGE_TEMPLATES[0]!.key);
  const [messageAr, setMessageAr]             = useState('');
  const [travelDate, setTravelDate]           = useState('');
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState<string | null>(null);
  const [copied, setCopied]                   = useState(false);

  const remainingSAR = halalasToSAR(Math.max(0, totalHalalas - paidHalalas));
  const amountSAR    = halalasToSAR(paidHalalas);

  const buildVars = useCallback(() => ({
    customerName: customerNameAr,
    bookingNumber,
    amountSAR,
    remainingSAR,
    travelDate: travelDate || (isAr ? 'غير محدد' : 'TBD'),
  }), [customerNameAr, bookingNumber, amountSAR, remainingSAR, travelDate, isAr]);

  // Re-fill textarea when template or travelDate changes
  useEffect(() => {
    const tpl = getTemplate(selectedKey);
    if (tpl) setMessageAr(tpl.textAr(buildVars()));
  }, [selectedKey, buildVars]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<{ messages: CustomerMessage[] }>(
        `/api/bookings/${bookingId}/messages`,
      );
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  function openModal() {
    setSaveError(null);
    setCopied(false);
    setTravelDate('');
    const tpl = getTemplate(selectedKey) ?? MESSAGE_TEMPLATES[0]!;
    setSelectedKey(tpl.key);
    setMessageAr(tpl.textAr(buildVars()));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setSaveError(null);
    setCopied(false);
  }

  async function logMessage(channel: 'whatsapp' | 'copy') {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          recipientName:  customerNameAr,
          recipientPhone: customerPhone ?? undefined,
          channel,
          templateKey:    selectedKey,
          messageAr,
          messageEn:      getTemplate(selectedKey)?.textEn(buildVars()),
        }),
      });
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
      return false;
    }
    setSaving(false);
    return true;
  }

  async function handleWhatsApp() {
    const phone = customerPhone ? phoneToWaNumber(customerPhone) : '';
    if (!phone) {
      setSaveError(isAr ? 'لا يوجد رقم هاتف لهذا العميل' : 'No phone number for this customer');
      return;
    }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(messageAr)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    const ok = await logMessage('whatsapp');
    if (ok) closeModal();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(messageAr);
    } catch {
      // clipboard API can fail in some browsers — proceed to log anyway
    }
    setCopied(true);
    const ok = await logMessage('copy');
    if (ok) closeModal();
  }

  const templateNeedsTravelDate = selectedKey === 'travel_reminder';

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-brand-600" />
                {isAr
                  ? `رسائل العميل${messages.length > 0 ? ` (${messages.length})` : ''}`
                  : `Customer Messages${messages.length > 0 ? ` (${messages.length})` : ''}`}
              </div>
              {!isCancelled && (
                <Button variant="outline" size="sm" onClick={openModal}>
                  <Send size={14} className="me-1.5" />
                  {isAr ? 'إرسال رسالة' : 'Send Message'}
                </Button>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4 text-center">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {isAr ? 'لا توجد رسائل مرسلة بعد' : 'No messages sent yet'}
          </p>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const tpl = msg.templateKey ? getTemplate(msg.templateKey) : null;
              const date = msg.sentAt ? new Date(msg.sentAt) : null;
              return (
                <div
                  key={msg.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {msg.channel === 'whatsapp'
                      ? <Phone size={14} className="text-emerald-600" />
                      : <Copy size={14} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-700">
                        {tpl ? (isAr ? tpl.labelAr : tpl.labelEn) : channelLabel(msg.channel, isAr)}
                      </span>
                      {date && (
                        <span className="text-xs text-slate-400">
                          {formatDate(date, isAr ? 'ar-SA' : 'en-SA')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">
                      {msg.messageAr}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Send Message Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />

          {/* Modal card */}
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                {isAr ? 'إرسال رسالة للعميل' : 'Send Customer Message'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Template selector */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {isAr ? 'نوع الرسالة' : 'Message Type'}
                </label>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {MESSAGE_TEMPLATES.map((tpl) => (
                    <option key={tpl.key} value={tpl.key}>
                      {isAr ? tpl.labelAr : tpl.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Travel date input — only for travel_reminder */}
              {templateNeedsTravelDate && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    {isAr ? 'تاريخ السفر' : 'Travel Date'}
                  </label>
                  <input
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              )}

              {/* Message textarea */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {isAr ? 'نص الرسالة' : 'Message Text'}
                </label>
                <textarea
                  value={messageAr}
                  onChange={(e) => setMessageAr(e.target.value)}
                  rows={6}
                  dir="rtl"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              {/* Recipient phone info */}
              {!customerPhone && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                  {isAr
                    ? 'لم يُسجَّل رقم هاتف للعميل — يمكن استخدام النسخ فقط'
                    : 'No customer phone on record — copy only is available'}
                </p>
              )}

              {saveError && (
                <p className="text-sm text-red-600">{saveError}</p>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              {/* WhatsApp */}
              <Button
                onClick={handleWhatsApp}
                disabled={saving || !customerPhone}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Phone size={14} className="me-1.5" />
                    {isAr ? 'واتساب' : 'WhatsApp'}
                  </>
                )}
              </Button>

              {/* Copy */}
              <Button
                onClick={handleCopy}
                disabled={saving}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                {saving ? (
                  <Spinner size="sm" />
                ) : copied ? (
                  <>
                    <CheckCheck size={14} className="me-1.5 text-emerald-600" />
                    {isAr ? 'تم النسخ' : 'Copied!'}
                  </>
                ) : (
                  <>
                    <Copy size={14} className="me-1.5" />
                    {isAr ? 'نسخ الرسالة' : 'Copy Text'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
