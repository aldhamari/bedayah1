'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٥ب: الأشخاص.
//
//  رقم الهوية يصل من الخادم مُقنَّعًا في القوائم (••••••5678).
//  الواجهة لا تملك الرقم الكامل أصلًا، فلا يمكن تسريبه من هنا.
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

type Person = {
  id: string;
  fullName: string;
  nationalId: string | null;
  nationality: string | null;
  jobTitle: string | null;
  isActive: boolean;
  _count: { licenses: number };
};

export default function PersonsPage() {
  const { data, error, loading, reload } = useApi<Person[]>('/persons?includeInactive=true');
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);

    const form = new FormData(e.currentTarget);
    const nationalId = String(form.get('nationalId') ?? '').trim();

    const payload: Record<string, unknown> = {
      fullName: form.get('fullName'),
      nationality: String(form.get('nationality') ?? '').trim() || null,
      jobTitle: String(form.get('jobTitle') ?? '').trim() || null,
    };

    // عند التعديل: حقل فارغ يعني «لا تُغيّر»، لا «امسح» — الرقم
    // المعروض مُقنَّع، فإرساله كما هو سيحفظ النقاط مكان الرقم.
    if (nationalId) payload.nationalId = nationalId;

    try {
      if (editing === 'new') await api.post('/persons', payload);
      else if (editing) await api.patch(`/persons/${editing.id}`, payload);
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(p: Person) {
    setFormError(null);
    try {
      await api.del(`/persons/${p.id}`);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'تعذّر التعطيل');
    }
  }

  return (
    <>
      <PageHeader
        title="الأشخاص"
        subtitle="الإقامات والشهادات الصحية والرخص المهنية ترتبط بأشخاص"
        action={<Button onClick={() => { setEditing('new'); setFormError(null); }}>أضف شخصًا</Button>}
      />

      {formError && <div className="mb-4"><Alert>{formError}</Alert></div>}

      {editing && (
        <Card className="mb-6 max-w-2xl">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {editing === 'new' ? 'شخص جديد' : `تعديل: ${editing.fullName}`}
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <Field label="الاسم الكامل">
              <Input name="fullName" required defaultValue={editing === 'new' ? '' : editing.fullName} />
            </Field>

            <Field
              label="رقم الهوية أو الإقامة (اختياري)"
              hint={
                editing === 'new'
                  ? 'عشرة أرقام تبدأ بـ ١ أو ٢. يُحفظ مشفَّرًا ولا يظهر كاملًا في القوائم.'
                  : 'اتركه فارغًا للإبقاء على الرقم الحالي كما هو.'
              }
            >
              <Input
                name="nationalId"
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
                placeholder={editing === 'new' ? '' : editing.nationalId ?? ''}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الجنسية (اختياري)">
                <Input name="nationality" defaultValue={editing === 'new' ? '' : editing.nationality ?? ''} />
              </Field>
              <Field label="المسمّى الوظيفي (اختياري)">
                <Input name="jobTitle" defaultValue={editing === 'new' ? '' : editing.jobTitle ?? ''} />
              </Field>
            </div>

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
            title="لا يوجد أشخاص بعد"
            description="أضف الموظفين الذين لهم إقامات أو شهادات تحتاج متابعة."
            action={<Button onClick={() => setEditing('new')}>أضف شخصًا</Button>}
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>الاسم</Th>
                <Th>الهوية / الإقامة</Th>
                <Th>الجنسية</Th>
                <Th>الوظيفة</Th>
                <Th>التراخيص</Th>
                <Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'opacity-60'}>
                  <Td>
                    <span className="font-medium text-slate-900">{p.fullName}</span>
                    {!p.isActive && <span className="ms-2 text-xs text-slate-500">(معطّل)</span>}
                  </Td>
                  <Td className="text-slate-600" dir="ltr">{p.nationalId ?? '—'}</Td>
                  <Td className="text-slate-600">{p.nationality ?? '—'}</Td>
                  <Td className="text-slate-600">{p.jobTitle ?? '—'}</Td>
                  <Td>
                    {p._count.licenses > 0 ? (
                      <Link href={`/licenses?personId=${p.id}`} className="text-slate-900 underline">
                        {p._count.licenses}
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button tone="secondary" onClick={() => { setEditing(p); setFormError(null); }}>
                        تعديل
                      </Button>
                      {p.isActive && <Button tone="ghost" onClick={() => deactivate(p)}>تعطيل</Button>}
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
