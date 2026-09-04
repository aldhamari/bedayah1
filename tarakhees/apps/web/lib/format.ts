// ══════════════════════════════════════════════════════════════
//  apps/web/lib/format.ts
//
//  القاعدة الثابتة رقم ٣: التواريخ تُعرض ميلادية وهجرية معًا حين
//  يتوفر الهجري. كل عرض لتاريخ في الواجهة يمرّ من هنا.
// ══════════════════════════════════════════════════════════════

export type LicenseStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'UNDER_RENEWAL'
  | 'CANCELLED';

export const STATUS_LABEL: Record<LicenseStatus, string> = {
  ACTIVE: 'ساري',
  EXPIRING_SOON: 'يقترب من الانتهاء',
  EXPIRED: 'منتهي',
  UNDER_RENEWAL: 'قيد التجديد',
  CANCELLED: 'ملغي',
};

/** ألوان اللوحة: أحمر منتهٍ · برتقالي ٣٠ · أصفر ٦٠ · أخضر ساري */
export const STATUS_TONE: Record<LicenseStatus, string> = {
  EXPIRED: 'bg-red-100 text-red-800 ring-red-200',
  EXPIRING_SOON: 'bg-amber-100 text-amber-900 ring-amber-200',
  UNDER_RENEWAL: 'bg-sky-100 text-sky-800 ring-sky-200',
  ACTIVE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/** لون حسب قرب الانتهاء — يُستعمل في الشريط الزمني وصفوف الجدول */
export function urgencyTone(daysLeft: number | null): string {
  if (daysLeft === null) return 'bg-slate-400';
  if (daysLeft < 0) return 'bg-red-500';
  if (daysLeft <= 30) return 'bg-orange-500';
  if (daysLeft <= 60) return 'bg-amber-400';
  return 'bg-emerald-500';
}

const gregorian = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** «١٥ مارس ٢٠٢٧» بأرقام لاتينية — أوضح في جدول مزدحم */
export function formatGregorian(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(`${iso.slice(0, 10)}T00:00:00.000Z`) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return gregorian.format(d);
}

const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

/** «١٥ رمضان ١٤٤٨هـ» من النص المخزَّن `1448-09-15` */
export function formatHijri(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [y, m, d] = stored.split('-').map(Number);
  if (!y || !m || !d) return null;
  return `${d} ${HIJRI_MONTHS[m - 1] ?? m} ${y}هـ`;
}

/** «متبقٍ ٤٥ يومًا» / «متأخر ١٢ يومًا» / «ينتهي اليوم» */
export function formatDaysLeft(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—';
  if (days === 0) return 'ينتهي اليوم';
  if (days < 0) return `متأخر ${arabicPlural(-days, 'يوم', 'يومين', 'أيام', 'يومًا')}`;
  return `متبقٍ ${arabicPlural(days, 'يوم', 'يومان', 'أيام', 'يومًا')}`;
}

/**
 * العدد في العربية يغيّر تمييزه: مفرد، مثنى، جمع (٣–١٠)، ثم مفرد
 * منصوب (١١ فأكثر). «٢٥ يوم» خطأ شائع — الصواب «٢٥ يومًا».
 * `accusative` هو صيغة التمييز المنصوب؛ يعود إلى `one` إن لم يُمرَّر.
 */
export function arabicPlural(
  n: number,
  one: string,
  two: string,
  many: string,
  accusative?: string,
): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${many}`;
  return `${n} ${accusative ?? one}`;
}

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${n.toLocaleString('ar-SA-u-nu-latn', { minimumFractionDigits: 2 })} ر.س`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Riyadh',
  }).format(d);
}

export const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'واتساب',
  EMAIL: 'بريد إلكتروني',
  SMS: 'رسالة نصية',
  IN_APP: 'داخل النظام',
};

export const DELIVERY_LABEL: Record<string, string> = {
  SCHEDULED: 'مجدول',
  SENT: 'أُرسل',
  FAILED: 'فشل',
  CANCELLED: 'أُلغي',
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'مالك',
  MANAGER: 'مدير',
  VIEWER: 'مطّلع',
};

/** «قبل ٦٠ يومًا» / «يوم الانتهاء» / «بعد ٧ أيام» */
export function offsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'يوم الانتهاء';
  if (offsetDays > 0) return `قبل ${arabicPlural(offsetDays, 'يوم', 'يومين', 'أيام', 'يومًا')}`;
  return `بعد ${arabicPlural(-offsetDays, 'يوم', 'يومين', 'أيام', 'يومًا')} من الانتهاء`;
}
