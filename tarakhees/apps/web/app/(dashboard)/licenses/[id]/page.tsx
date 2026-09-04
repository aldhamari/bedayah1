'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٣: صفحة الترخيص — ثلاثة تبويبات
//  البيانات · سجل الفترات · سجل التنبيهات
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { RenewDialog } from '@/components/RenewDialog';
import {
  Alert,
  Button,
  Card,
  DateCell,
  EmptyState,
  PageHeader,
  Spinner,
  StatusBadge,
  TableWrap,
  Td,
  Th,
} from '@/components/ui';
import { useApi } from '@/lib/api';
import {
  CHANNEL_LABEL,
  DELIVERY_LABEL,
  formatDateTime,
  formatMoney,
  offsetLabel,
  type LicenseStatus,
} from '@/lib/format';

type Period = {
  id: string;
  issueDate: string | null;
  expiryDate: string;
  expiryHijri: string | null;
  cost: string | null;
  isCurrent: boolean;
  closedAt: string | null;
  daysLeft: number;
  documents: { id: string; fileName: string }[];
};

type Delivery = {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  errorText: string | null;
  sentAt: string;
  bodySnapshot: string;
};

type Detail = {
  id: string;
  number: string | null;
  label: string | null;
  notes: string | null;
  status: LicenseStatus;
  isArchived: boolean;
  createdAt: string;
  licenseType: {
    nameAr: string;
    authority: string | null;
    renewalUrl: string | null;
    typicalPenaltyNote: string | null;
  };
  holder: { kind: 'FACILITY' | 'PERSON'; id: string; name: string } | null;
  current: (Period & { daysLeft: number }) | null;
  periods: Period[];
  reminders: {
    id: string;
    offsetDays: number;
    dueOn: string;
    status: string;
    deliveries: Delivery[];
  }[];
};

const TABS = [
  { key: 'data', label: 'البيانات' },
  { key: 'periods', label: 'سجل الفترات' },
  { key: 'reminders', label: 'سجل التنبيهات' },
] as const;

export default function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('data');
  const [renewing, setRenewing] = useState(false);

  const { data, error, loading, reload } = useApi<Detail>(`/licenses/${id}`);

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  return (
    <>
      <PageHeader
        title={data.licenseType.nameAr}
        subtitle={[data.label, data.number && `رقم ${data.number}`].filter(Boolean).join(' · ') || undefined}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} />
            <Button onClick={() => setRenewing(true)}>جدّد</Button>
          </div>
        }
      />

      <div className="mb-6 border-b border-slate-200">
        <div role="tablist" aria-label="أقسام الترخيص" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === t.key
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {t.key === 'periods' && ` (${data.periods.length})`}
              {t.key === 'reminders' && ` (${data.reminders.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ─────────── البيانات ─────────── */}
      {tab === 'data' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Row label="نوع الترخيص" value={data.licenseType.nameAr} />
              <Row label="الجهة المُصدِرة" value={data.licenseType.authority ?? '—'} />
              <Row label="رقم الترخيص" value={data.number ?? '—'} />
              <Row label="التسمية" value={data.label ?? '—'} />
              <Row
                label={data.holder?.kind === 'PERSON' ? 'الشخص' : 'الفرع'}
                value={
                  data.holder ? (
                    <Link
                      href={data.holder.kind === 'PERSON' ? '/persons' : '/facilities'}
                      className="text-slate-900 underline"
                    >
                      {data.holder.name}
                    </Link>
                  ) : '—'
                }
              />
              <Row label="أُضيف في" value={formatDateTime(data.createdAt)} />
            </dl>

            {data.notes && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <dt className="mb-1 text-xs font-medium text-slate-500">ملاحظات</dt>
                <dd className="whitespace-pre-wrap text-sm text-slate-800">{data.notes}</dd>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-900">الفترة الحالية</h2>
              {data.current ? (
                <>
                  <DateCell
                    gregorian={data.current.expiryDate}
                    hijri={data.current.expiryHijri}
                    daysLeft={data.current.daysLeft}
                  />
                  <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">تاريخ الإصدار</dt>
                      <dd className="text-slate-800">
                        {data.current.issueDate ? <DateCell gregorian={data.current.issueDate} /> : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">التكلفة</dt>
                      <dd className="text-slate-800">{formatMoney(data.current.cost)}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-slate-500">لا توجد فترة حالية.</p>
              )}
            </Card>

            {data.licenseType.typicalPenaltyNote && (
              <Alert tone="warning">{data.licenseType.typicalPenaltyNote}</Alert>
            )}

            {data.licenseType.renewalUrl && (
              <a
                href={data.licenseType.renewalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg bg-white px-4 py-3 text-center text-sm font-medium
                           text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                بوابة الجهة للتجديد ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* ─────────── سجل الفترات ─────────── */}
      {tab === 'periods' && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            كل تجديد سابق بتواريخه وتكلفته. السجلات القديمة لا تُعدَّل أبدًا.
          </p>
          <TableWrap>
            <thead>
              <tr>
                <Th>تاريخ الانتهاء</Th>
                <Th>تاريخ الإصدار</Th>
                <Th>التكلفة</Th>
                <Th>المرفقات</Th>
                <Th>الحالة</Th>
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.id} className={p.isCurrent ? 'bg-emerald-50/40' : ''}>
                  <Td><DateCell gregorian={p.expiryDate} hijri={p.expiryHijri} /></Td>
                  <Td>{p.issueDate ? <DateCell gregorian={p.issueDate} /> : '—'}</Td>
                  <Td className="text-slate-700">{formatMoney(p.cost)}</Td>
                  <Td className="text-slate-600">
                    {p.documents.length > 0 ? `${p.documents.length} مرفق` : '—'}
                  </Td>
                  <Td>
                    {p.isCurrent ? (
                      <span className="text-xs font-medium text-emerald-700">الفترة الحالية</span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        أُغلقت {formatDateTime(p.closedAt)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}

      {/* ─────────── سجل التنبيهات ─────────── */}
      {tab === 'reminders' && (
        data.reminders.length === 0 ? (
          <EmptyState
            title="لم تُرسل تنبيهات بعد"
            description="تُنشأ التنبيهات تلقائيًا حين يقترب تاريخ الانتهاء من إحدى المهل المضبوطة في الإعدادات."
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ماذا أُرسل، لمن، متى، وهل وصل. هذا السجل لا يُعدَّل ولا يُحذف.
            </p>

            {data.reminders.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-sm font-medium text-slate-900">
                      {offsetLabel(r.offsetDays)}
                    </span>
                    <span className="ms-2 text-xs text-slate-500">
                      استحقّ في {formatDateTime(r.dueOn)}
                    </span>
                  </div>
                  <DeliveryBadge status={r.status} />
                </div>

                {r.deliveries.length === 0 ? (
                  <p className="pt-3 text-sm text-slate-500">لم تُسجَّل محاولة إرسال بعد.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {r.deliveries.map((d) => (
                      <li key={d.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-slate-800">
                            {CHANNEL_LABEL[d.channel] ?? d.channel}
                            <span dir="ltr" className="ms-2 text-xs text-slate-500">{d.recipient}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">{formatDateTime(d.sentAt)}</span>
                            <DeliveryBadge status={d.status} />
                          </div>
                        </div>

                        {d.errorText && (
                          <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                            {d.errorText}
                          </p>
                        )}

                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-500">
                            نص الرسالة كما أُرسلت
                          </summary>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
                            {d.bodySnapshot}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        )
      )}

      {renewing && (
        <RenewDialog
          licenseId={data.id}
          title={data.licenseType.nameAr}
          currentExpiry={data.current?.expiryDate ?? null}
          onClose={() => setRenewing(false)}
          onDone={() => {
            setRenewing(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function DeliveryBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    SENT: 'bg-emerald-100 text-emerald-800',
    FAILED: 'bg-red-100 text-red-800',
    SCHEDULED: 'bg-slate-100 text-slate-700',
    CANCELLED: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[status] ?? tones.SCHEDULED}`}>
      {DELIVERY_LABEL[status] ?? status}
    </span>
  );
}
