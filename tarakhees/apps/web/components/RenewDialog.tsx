'use client';

// ══════════════════════════════════════════════════════════════
//  حوار التجديد — يُستدعى من صف القائمة ومن صفحة الترخيص.
//
//  الرسالة أدناه مقصودة: المستخدم يجب أن يعرف أن الفترة الحالية
//  لا تُمحى بل تُحفظ في السجل. هذا ما يجعله يثق بأرقام التكلفة
//  التاريخية لاحقًا.
// ══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatGregorian } from '@/lib/format';

export function RenewDialog({
  licenseId,
  title,
  currentExpiry,
  onClose,
  onDone,
}: {
  licenseId: string;
  title: string;
  currentExpiry: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // الإغلاق بـ Escape — سلوك متوقّع في أي حوار
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector('input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const cost = String(form.get('cost') ?? '').trim();

    try {
      await api.post(`/licenses/${licenseId}/renew`, {
        expiryDate: form.get('expiryDate'),
        issueDate: String(form.get('issueDate') ?? '').trim() || null,
        cost: cost ? Number(cost) : null,
        sourceCalendar: 'GREGORIAN',
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر التجديد');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="renew-title"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="renew-title" className="text-lg font-semibold text-slate-900">
          تجديد: {title}
        </h2>

        {currentExpiry && (
          <p className="mt-1 text-sm text-slate-600">
            الفترة الحالية تنتهي في {formatGregorian(currentExpiry)}
          </p>
        )}

        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          الفترة الحالية لن تُحذف — تُغلَق وتبقى في سجل الفترات بتاريخها وتكلفتها.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <Alert>{error}</Alert>}

          <Field label="تاريخ الانتهاء الجديد">
            <Input name="expiryDate" type="date" required dir="ltr" />
          </Field>

          <Field label="تاريخ الإصدار (اختياري)">
            <Input name="issueDate" type="date" dir="ltr" />
          </Field>

          <Field label="التكلفة (اختياري)" hint="تُحفظ في سجل الفترة لمقارنة السنوات">
            <Input name="cost" type="number" min="0" step="0.01" dir="ltr" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" tone="secondary" onClick={onClose}>إلغاء</Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'احفظ التجديد'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
