'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٢: قائمة التراخيص — فلاتر وبحث وإجراءات سريعة من الصف
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { LICENSE_STATUSES } from '@repo/shared/licenses/license.schema';
import { RenewDialog } from '@/components/RenewDialog';
import {
  Alert,
  Button,
  DateCell,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  TableWrap,
  Td,
  Th,
} from '@/components/ui';
import { useApi } from '@/lib/api';
import { STATUS_LABEL, type LicenseStatus } from '@/lib/format';

type Row = {
  id: string;
  number: string | null;
  label: string | null;
  status: LicenseStatus;
  typeName: string;
  renewalUrl: string | null;
  holderName: string;
  expiryDate: string | null;
  expiryHijri: string | null;
  daysLeft: number | null;
};

type ListResponse = { total: number; page: number; pageSize: number; items: Row[] };
type Named = { id: string; name?: string; fullName?: string; nameAr?: string };

function LicensesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [renewing, setRenewing] = useState<Row | null>(null);

  // الفلاتر تعيش في الـURL: الرابط قابل للمشاركة والحفظ، والرجوع
  // بالمتصفح يعيد نفس النتيجة بدل أن يُفرغ الفلاتر.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.replace(`/licenses?${next.toString()}`);
  };

  const query = useMemo(() => {
    const q = new URLSearchParams(params.toString());
    if (!q.get('pageSize')) q.set('pageSize', '25');
    return q.toString();
  }, [params]);

  const { data, error, loading, reload } = useApi<ListResponse>(`/licenses?${query}`);
  const facilities = useApi<Named[]>('/facilities');
  const persons = useApi<Named[]>('/persons');
  const types = useApi<Named[]>('/license-types');

  const page = Number(params.get('page') ?? 1);
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const goPage = (n: number) => {
    const next = new URLSearchParams(params.toString());
    next.set('page', String(n));
    router.replace(`/licenses?${next.toString()}`);
  };

  return (
    <>
      <PageHeader
        title="التراخيص"
        subtitle={data ? `${data.total} ترخيصًا` : undefined}
        action={
          <div className="flex gap-2">
            <LinkButton href="/licenses/quick-entry">إدخال سريع</LinkButton>
            <LinkButton href="/licenses/new" tone="primary">أضف ترخيصًا</LinkButton>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          type="search"
          placeholder="بحث بالرقم أو التسمية أو الحامل"
          defaultValue={params.get('q') ?? ''}
          onChange={(e) => setParam('q', e.target.value)}
          aria-label="بحث"
          className="lg:col-span-2"
        />

        <Select
          value={params.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="الحالة"
        >
          <option value="">كل الحالات</option>
          {LICENSE_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </Select>

        <Select
          value={params.get('facilityId') ?? ''}
          onChange={(e) => setParam('facilityId', e.target.value)}
          aria-label="الفرع"
        >
          <option value="">كل الفروع</option>
          {(facilities.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>

        <Select
          value={params.get('licenseTypeId') ?? ''}
          onChange={(e) => setParam('licenseTypeId', e.target.value)}
          aria-label="النوع"
        >
          <option value="">كل الأنواع</option>
          {(types.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.nameAr}</option>
          ))}
        </Select>

        <Select
          value={params.get('personId') ?? ''}
          onChange={(e) => setParam('personId', e.target.value)}
          aria-label="الشخص"
        >
          <option value="">كل الأشخاص</option>
          {(persons.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.fullName}</option>
          ))}
        </Select>

        {[...params.keys()].some((k) => k !== 'page') && (
          <Button tone="ghost" onClick={() => router.replace('/licenses')}>
            مسح الفلاتر
          </Button>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && <Spinner />}

      {data && !loading && (
        data.items.length === 0 ? (
          <EmptyState
            title="لا توجد نتائج"
            description="جرّب توسيع الفلاتر، أو أضف ترخيصًا جديدًا."
            action={<LinkButton href="/licenses/new" tone="primary">أضف ترخيصًا</LinkButton>}
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>النوع</Th>
                  <Th>الرقم</Th>
                  <Th>الفرع / الشخص</Th>
                  <Th>تاريخ الانتهاء</Th>
                  <Th>الحالة</Th>
                  <Th>إجراءات</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/licenses/${row.id}`} className="font-medium text-slate-900 hover:underline">
                        {row.typeName}
                      </Link>
                      {row.label && <div className="text-xs text-slate-500">{row.label}</div>}
                    </Td>
                    <Td className="text-slate-600">{row.number ?? '—'}</Td>
                    <Td className="text-slate-600">{row.holderName}</Td>
                    <Td>
                      <DateCell
                        gregorian={row.expiryDate}
                        hijri={row.expiryHijri}
                        daysLeft={row.daysLeft}
                      />
                    </Td>
                    <Td><StatusBadge status={row.status} /></Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        <Button tone="secondary" onClick={() => setRenewing(row)}>جدّد</Button>
                        {row.renewalUrl && (
                          <a
                            href={row.renewalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-lg px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                          >
                            بوابة الجهة ↗
                          </a>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            {pageCount > 1 && (
              <nav className="mt-4 flex items-center justify-center gap-3" aria-label="صفحات">
                <Button tone="secondary" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                  السابق
                </Button>
                <span className="text-sm text-slate-600">صفحة {page} من {pageCount}</span>
                <Button tone="secondary" disabled={page >= pageCount} onClick={() => goPage(page + 1)}>
                  التالي
                </Button>
              </nav>
            )}
          </>
        )
      )}

      {renewing && (
        <RenewDialog
          licenseId={renewing.id}
          title={renewing.typeName}
          currentExpiry={renewing.expiryDate}
          onClose={() => setRenewing(null)}
          onDone={() => {
            setRenewing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

export default function LicensesPage() {
  // useSearchParams يتطلب حدود Suspense في App Router
  return (
    <Suspense fallback={<Spinner />}>
      <LicensesInner />
    </Suspense>
  );
}
