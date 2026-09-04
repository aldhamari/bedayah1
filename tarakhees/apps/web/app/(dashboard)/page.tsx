'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ١: لوحة القيادة
//  أربع بطاقات بالألوان · شريط زمني ٩٠ يومًا · جدول «يحتاج انتباهك»
//  · تنبيه علوي إن فشل إرسال أي إشعار
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import type { DashboardSummary } from '@repo/shared/licenses/license.schema';
import { Timeline90 } from '@/components/Timeline90';
import {
  Alert,
  Card,
  DateCell,
  EmptyState,
  LinkButton,
  PageHeader,
  Spinner,
  StatusBadge,
  Td,
  TableWrap,
  Th,
} from '@/components/ui';
import { useApi } from '@/lib/api';

const CARDS = [
  {
    key: 'expired',
    label: 'منتهي',
    tone: 'border-red-200 bg-red-50 text-red-900',
    dot: 'bg-red-500',
    href: '/licenses?status=EXPIRED',
  },
  {
    key: 'within30',
    label: 'خلال ٣٠ يومًا',
    tone: 'border-orange-200 bg-orange-50 text-orange-900',
    dot: 'bg-orange-500',
    href: '/licenses?expiringWithinDays=30',
  },
  {
    key: 'within60',
    label: 'خلال ٦٠ يومًا',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    dot: 'bg-amber-400',
    href: '/licenses?expiringWithinDays=60',
  },
  {
    key: 'active',
    label: 'ساري',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
    href: '/licenses?status=ACTIVE',
  },
] as const;

export default function DashboardPage() {
  const { data, error, loading } = useApi<DashboardSummary>('/dashboard/summary');

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const values: Record<string, number> = {
    expired: data.counts.EXPIRED,
    within30: data.within30,
    within60: data.within60,
    active: data.counts.ACTIVE,
  };

  const totalTracked = Object.values(data.counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="لوحة القيادة"
        subtitle="نظرة واحدة على ما يقترب من الانتهاء"
        action={<LinkButton href="/licenses/new" tone="primary">أضف ترخيصًا</LinkButton>}
      />

      {/* تنبيه علوي: إشعار لم يصل يعني عميلًا قد لا يعلم بانتهاء ترخيصه */}
      {data.failedReminders > 0 && (
        <div className="mb-6">
          <Alert tone="error">
            فشل إرسال {data.failedReminders} إشعارًا. راجع بيانات التواصل في{' '}
            <Link href="/settings" className="font-medium underline">
              الإعدادات
            </Link>
            ، فقد لا يصل التنبيه القادم.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className={`rounded-xl border p-5 transition hover:shadow-md ${card.tone}`}
          >
            <div className="flex items-center gap-2">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${card.dot}`} />
              <span className="text-sm font-medium">{card.label}</span>
            </div>
            <div className="mt-3 text-3xl font-semibold tabular-nums">{values[card.key]}</div>
          </Link>
        ))}
      </div>

      {totalTracked === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="لا توجد تراخيص بعد"
            description="أسرع طريق: الصق بياناتك من إكسل في شاشة الإدخال السريع — خمسة تراخيص في دقيقتين."
            action={<LinkButton href="/licenses/quick-entry" tone="primary">ابدأ الإدخال السريع</LinkButton>}
          />
        </div>
      ) : (
        <>
          <div className="mt-8">
            <Card>
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                التسعون يومًا القادمة
              </h2>
              <Timeline90 items={data.timeline} />
            </Card>
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-slate-900">يحتاج انتباهك الآن</h2>

            {data.attention.length === 0 ? (
              <EmptyState
                title="لا شيء يقترب من الانتهاء"
                description="كل التراخيص سارية بفارق مريح. سنُنبّهك قبل ٦٠ يومًا من أقرب انتهاء."
              />
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>النوع</Th>
                    <Th>الرقم</Th>
                    <Th>الحامل</Th>
                    <Th>تاريخ الانتهاء</Th>
                    <Th>الحالة</Th>
                    <Th>‏</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.attention.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">{row.typeName}</Td>
                      <Td className="text-slate-600" >{row.number ?? '—'}</Td>
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
                        <Link
                          href={`/licenses/${row.id}`}
                          className="text-sm font-medium text-slate-900 underline"
                        >
                          فتح
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </section>
        </>
      )}
    </>
  );
}
