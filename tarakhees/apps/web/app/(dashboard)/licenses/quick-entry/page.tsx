'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٤: الإدخال السريع.
//
//  QuickEntryGrid ملف جاهز لم يُعدَّل. مهمة هذه الصفحة تزويده
//  بالكتالوج والحاملين وحدها — وهو ينادي /api/licenses/bulk بنفسه،
//  والبروكسي في app/api/[...path] يُلحق رمز التفويض.
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, EmptyState, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { CatalogEntry } from '@/lib/licenses/parsers';
import QuickEntryGrid from './QuickEntryGrid';

type Facility = { id: string; name: string };
type Person = { id: string; fullName: string };

export default function QuickEntryPage() {
  const router = useRouter();
  const [saved, setSaved] = useState<number | null>(null);

  const types = useApi<(CatalogEntry & { isActive: boolean })[]>('/license-types');
  const facilities = useApi<Facility[]>('/facilities');
  const persons = useApi<Person[]>('/persons');

  const loading = types.loading || facilities.loading || persons.loading;
  const error = types.error ?? facilities.error ?? persons.error;

  if (loading) return <Spinner />;
  if (error) return <Alert>{error}</Alert>;

  const catalog: CatalogEntry[] = (types.data ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    nameAr: t.nameAr,
    holderType: t.holderType,
  }));

  const holders = [
    ...(facilities.data ?? []).map((f) => ({ id: f.id, name: f.name, kind: 'FACILITY' as const })),
    ...(persons.data ?? []).map((p) => ({ id: p.id, name: p.fullName, kind: 'PERSON' as const })),
  ];

  // بلا فرع ولا شخص لا يمكن ربط أي ترخيص — فنوجّه لإنشاء واحد أولًا
  if (holders.length === 0) {
    return (
      <>
        <PageHeader title="الإدخال السريع" />
        <EmptyState
          title="أضف فرعًا أو شخصًا أولًا"
          description="كل ترخيص يرتبط بفرع أو بشخص. أنشئ فرعك الرئيسي ثم عُد إلى هنا."
          action={<LinkButton href="/facilities" tone="primary">أضف فرعًا</LinkButton>}
        />
      </>
    );
  }

  return (
    <>
      {saved !== null && (
        <div className="mb-6">
          <Alert tone="success">
            حُفظ {saved} ترخيصًا.{' '}
            <Link href="/licenses" className="font-medium underline">اعرض القائمة</Link>
            {' · '}
            <Link href="/" className="font-medium underline">لوحة القيادة</Link>
          </Alert>
        </div>
      )}

      <QuickEntryGrid
        catalog={catalog}
        holders={holders}
        onSaved={(count) => {
          setSaved(count);
          router.refresh();
        }}
      />
    </>
  );
}
