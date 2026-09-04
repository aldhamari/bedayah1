'use client';

// ══════════════════════════════════════════════════════════════
//  شريط زمني أفقي لتسعين يومًا، كل ترخيص نقطة عليه.
//
//  الغرض منه رؤية التكتّل: خمسة تراخيص تنتهي في نفس الأسبوع
//  مشكلة تدبير مختلفة تمامًا عن خمسة موزّعة على ثلاثة أشهر.
//  ولهذا نجمّع بالأسبوع بدل رسم نقطة لكل يوم.
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { arabicPlural, urgencyTone } from '@/lib/format';

type Item = { id: string; typeName: string; expiryDate: string; daysLeft: number };

const WEEKS = 13; // ٩١ يومًا

export function Timeline90({ items }: { items: Item[] }) {
  const buckets: Item[][] = Array.from({ length: WEEKS }, () => []);

  for (const item of items) {
    const week = Math.min(WEEKS - 1, Math.max(0, Math.floor(item.daysLeft / 7)));
    buckets[week].push(item);
  }

  const busiest = Math.max(1, ...buckets.map((b) => b.length));

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        لا ينتهي أي ترخيص خلال التسعين يومًا القادمة.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-1" role="list" aria-label="التراخيص المنتهية خلال ٩٠ يومًا">
        {buckets.map((bucket, week) => {
          const height = bucket.length === 0 ? 4 : 12 + (bucket.length / busiest) * 76;
          const soonest = bucket.reduce<number | null>(
            (min, i) => (min === null ? i.daysLeft : Math.min(min, i.daysLeft)),
            null,
          );

          return (
            <div key={week} role="listitem" className="group relative flex flex-1 flex-col items-center">
              <div
                className={`w-full rounded-t transition ${
                  bucket.length === 0 ? 'bg-slate-200' : urgencyTone(soonest)
                }`}
                style={{ height: `${height}px` }}
              />
              {bucket.length > 0 && (
                <span className="mt-1 text-[11px] font-medium tabular-nums text-slate-700">
                  {bucket.length}
                </span>
              )}

              {bucket.length > 0 && (
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-2 hidden w-56 rounded-lg
                             bg-slate-900 p-3 text-start text-xs text-white shadow-lg group-hover:block"
                >
                  <div className="mb-1 font-medium">
                    الأسبوع {week + 1} — {arabicPlural(bucket.length, 'ترخيص', 'ترخيصان', 'تراخيص', 'ترخيصًا')}
                  </div>
                  <ul className="space-y-0.5 text-slate-200">
                    {bucket.slice(0, 5).map((i) => (
                      <li key={i.id}>• {i.typeName}</li>
                    ))}
                    {bucket.length > 5 && <li>… و{bucket.length - 5} غيرها</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>اليوم</span>
        <span>بعد ٤٥ يومًا</span>
        <span>بعد ٩٠ يومًا</span>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        كل عمود أسبوع، وارتفاعه عدد التراخيص المنتهية فيه.{' '}
        <Link href="/licenses?expiringWithinDays=90" className="underline">
          اعرضها كقائمة
        </Link>
      </p>
    </div>
  );
}
