'use client';

// ══════════════════════════════════════════════════════════════
//  إضافة ترخيص — معالج من خطوة واحدة مركّزة.
//  اختيار النوع يملأ الافتراضيات (مدة الصلاحية) تلقائيًا.
// ══════════════════════════════════════════════════════════════

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';

type Type = {
  id: string;
  nameAr: string;
  holderType: 'FACILITY' | 'PERSON';
  defaultDurationMo: number | null;
  authority: string | null;
  typicalPenaltyNote: string | null;
};

export default function NewLicensePage() {
  const router = useRouter();
  const [typeId, setTypeId] = useState('');
  const [expiry, setExpiry] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useApi<Type[]>('/license-types');
  const facilities = useApi<{ id: string; name: string }[]>('/facilities');
  const persons = useApi<{ id: string; fullName: string }[]>('/persons');

  const selected = useMemo(
    () => types.data?.find((t) => t.id === typeId) ?? null,
    [types.data, typeId],
  );

  /** اختيار النوع يقترح تاريخ الانتهاء من مدة الصلاحية الاعتيادية */
  function pickType(id: string) {
    setTypeId(id);
    const type = types.data?.find((t) => t.id === id);
    if (type?.defaultDurationMo && !expiry) {
      const d = new Date();
      d.setMonth(d.getMonth() + type.defaultDurationMo);
      setExpiry(d.toISOString().slice(0, 10));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral(null);

    const form = new FormData(e.currentTarget);
    const holderId = String(form.get('holderId') ?? '');
    const cost = String(form.get('cost') ?? '').trim();

    try {
      const created = await api.post<{ id: string }>('/licenses', {
        licenseTypeId: typeId,
        facilityId: selected?.holderType === 'FACILITY' ? holderId : null,
        personId: selected?.holderType === 'PERSON' ? holderId : null,
        number: String(form.get('number') ?? '').trim() || null,
        label: String(form.get('label') ?? '').trim() || null,
        notes: String(form.get('notes') ?? '').trim() || null,
        expiryDate: form.get('expiryDate'),
        issueDate: String(form.get('issueDate') ?? '').trim() || null,
        cost: cost ? Number(cost) : null,
        sourceCalendar: 'GREGORIAN',
      });
      router.push(`/licenses/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      } else {
        setGeneral(err instanceof Error ? err.message : 'تعذّر الحفظ');
      }
      setBusy(false);
    }
  }

  if (types.loading || facilities.loading || persons.loading) return <Spinner />;

  const holders =
    selected?.holderType === 'PERSON'
      ? (persons.data ?? []).map((p) => ({ id: p.id, name: p.fullName }))
      : (facilities.data ?? []).map((f) => ({ id: f.id, name: f.name }));

  return (
    <>
      <PageHeader title="أضف ترخيصًا" subtitle="لإدخال عدة تراخيص دفعة واحدة، استخدم الإدخال السريع" />

      <Card className="max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          {general && <Alert>{general}</Alert>}

          <Field label="نوع الترخيص" error={errors.licenseTypeId}>
            <Select value={typeId} onChange={(e) => pickType(e.target.value)} required>
              <option value="">اختر النوع…</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameAr}{t.authority ? ` — ${t.authority}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {selected?.typicalPenaltyNote && (
            <Alert tone="warning">{selected.typicalPenaltyNote}</Alert>
          )}

          {selected && (
            <>
              <Field
                label={selected.holderType === 'PERSON' ? 'الشخص' : 'الفرع'}
                error={errors.facilityId ?? errors.personId}
              >
                <Select name="holderId" required>
                  <option value="">اختر…</option>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </Select>
              </Field>

              {holders.length === 0 && (
                <Alert tone="warning">
                  لا يوجد {selected.holderType === 'PERSON' ? 'أشخاص' : 'فروع'} بعد — أضف واحدًا أولًا.
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="رقم الترخيص (اختياري)" error={errors.number}>
                  <Input name="number" dir="ltr" />
                </Field>
                <Field label="تسمية (اختياري)" error={errors.label} hint="مثل: رخصة فرع الملز">
                  <Input name="label" />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="تاريخ الانتهاء" error={errors.expiryDate}>
                  <Input
                    name="expiryDate"
                    type="date"
                    required
                    dir="ltr"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                </Field>
                <Field label="تاريخ الإصدار (اختياري)" error={errors.issueDate}>
                  <Input name="issueDate" type="date" dir="ltr" />
                </Field>
              </div>

              <Field label="التكلفة (اختياري)" error={errors.cost}>
                <Input name="cost" type="number" min="0" step="0.01" dir="ltr" />
              </Field>

              <Field label="ملاحظات (اختياري)" error={errors.notes}>
                <Textarea name="notes" rows={3} />
              </Field>
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" tone="secondary" onClick={() => router.back()}>إلغاء</Button>
            <Button type="submit" disabled={busy || !selected}>
              {busy ? 'جارٍ الحفظ…' : 'احفظ الترخيص'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
