'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٥أ: الفروع — مع عدد التراخيص المرتبطة بكل فرع
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';

type Facility = {
  id: string;
  name: string;
  crNumber: string | null;
  city: string | null;
  address: string | null;
  isActive: boolean;
  _count: { licenses: number };
};

export default function FacilitiesPage() {
  const { data, error, loading, reload } = useApi<Facility[]>('/facilities?includeInactive=true');
  const [editing, setEditing] = useState<Facility | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get('name'),
      crNumber: String(form.get('crNumber') ?? '').trim() || null,
      city: String(form.get('city') ?? '').trim() || null,
      address: String(form.get('address') ?? '').trim() || null,
    };

    try {
      if (editing === 'new') await api.post('/facilities', payload);
      else if (editing) await api.patch(`/facilities/${editing.id}`, payload);
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(f: Facility) {
    setFormError(null);
    try {
      await api.del(`/facilities/${f.id}`);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر التعطيل');
    }
  }

  return (
    <>
      <PageHeader
        title="الفروع"
        subtitle="كل ترخيص منشأة يرتبط بفرع"
        action={<Button onClick={() => { setEditing('new'); setFormError(null); }}>أضف فرعًا</Button>}
      />

      {formError && <div className="mb-4"><Alert>{formError}</Alert></div>}

      {editing && (
        <Card className="mb-6 max-w-2xl">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {editing === 'new' ? 'فرع جديد' : `تعديل: ${editing.name}`}
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <Field label="اسم الفرع">
              <Input name="name" required defaultValue={editing === 'new' ? '' : editing.name} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="رقم السجل التجاري (اختياري)">
                <Input name="crNumber" dir="ltr" defaultValue={editing === 'new' ? '' : editing.crNumber ?? ''} />
              </Field>
              <Field label="المدينة (اختياري)">
                <Input name="city" defaultValue={editing === 'new' ? '' : editing.city ?? ''} />
              </Field>
            </div>
            <Field label="العنوان (اختياري)">
              <Input name="address" defaultValue={editing === 'new' ? '' : editing.address ?? ''} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" tone="secondary" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'احفظ'}</Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <Spinner />}
      {error && <Alert>{error}</Alert>}

      {data && !loading && (
        data.length === 0 ? (
          <EmptyState
            title="لا توجد فروع بعد"
            description="أضف فرعك الرئيسي لتبدأ بربط التراخيص به."
            action={<Button onClick={() => setEditing('new')}>أضف فرعًا</Button>}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>المدينة</Th>
                <Th>السجل التجاري</Th>
                <Th>التراخيص</Th>
                <Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr key={f.id} className={f.isActive ? '' : 'opacity-60'}>
                  <Td>
                    <span className="font-medium text-slate-900">{f.name}</span>
                    {!f.isActive && <span className="ms-2 text-xs text-slate-500">(معطّل)</span>}
                    {f.address && <div className="text-xs text-slate-500">{f.address}</div>}
                  </Td>
                  <Td className="text-slate-600">{f.city ?? '—'}</Td>
                  <Td className="text-slate-600" dir="ltr">{f.crNumber ?? '—'}</Td>
                  <Td>
                    {f._count.licenses > 0 ? (
                      <Link href={`/licenses?facilityId=${f.id}`} className="text-slate-900 underline">
                        {f._count.licenses}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button tone="secondary" onClick={() => { setEditing(f); setFormError(null); }}>
                        تعديل
                      </Button>
                      {f.isActive && (
                        <Button tone="ghost" onClick={() => deactivate(f)}>تعطيل</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )
      )}
    </>
  );
}
