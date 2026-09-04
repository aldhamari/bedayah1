// ══════════════════════════════════════════════════════════════
//  apps/api/src/licenses/hijri.util.ts
//
//  تحويل ميلادي ← هجري (أم القرى) مرة واحدة عند الإدخال.
//
//  الميلادي هو المرجع لكل الحسابات والفهرسة، والهجري نص للعرض فقط
//  (القرار التصميمي الثاني في docs/license-tracker-design.md).
//  إصدار @umalqura/core مثبَّت في package.json حتى لا يتغيّر التحويل
//  تحت أرجل بيانات محفوظة.
// ══════════════════════════════════════════════════════════════

import umalqura from '@umalqura/core';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * يُرجع `1448-03-15` أو null إن خرج التاريخ عن مدى تقويم أم القرى
 * (تقريبًا ١٩٣٧–٢٠٧٧م). لا نرمي خطأً: تعذُّر العرض الهجري لا يمنع
 * حفظ ترخيص تاريخه الميلادي صحيح.
 */
export function toHijriString(gregorian: Date): string | null {
  try {
    const h = umalqura(gregorian);
    return `${h.hy}-${pad(h.hm)}-${pad(h.hd)}`;
  } catch {
    return null;
  }
}
