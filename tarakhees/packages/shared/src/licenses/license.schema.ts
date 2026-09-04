// ══════════════════════════════════════════════════════════════
//  packages/shared/src/licenses/license.schema.ts
//
//  عقود التراخيص والفروع والأشخاص والكتالوج.
//  تستوردها الواجهة والـ API معًا فلا ينحرف أحدهما عن الآخر.
// ══════════════════════════════════════════════════════════════

import { z } from 'zod';

export const LICENSE_STATUSES = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'UNDER_RENEWAL',
  'CANCELLED',
] as const;
export type LicenseStatusValue = (typeof LICENSE_STATUSES)[number];

export const HOLDER_TYPES = ['FACILITY', 'PERSON'] as const;
export const CALENDAR_TYPES = ['GREGORIAN', 'HIJRI'] as const;

/** تاريخ تقويمي بصيغة YYYY-MM-DD — لا لحظة زمنية. القاعدة الثابتة رقم ١. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), 'تاريخ غير موجود');

const hijriDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ هجري غير صالح');

// ─────────────── الفروع ───────────────

export const facilityInputSchema = z.object({
  name: z.string().trim().min(2, 'اسم الفرع مطلوب').max(160),
  crNumber: z.string().trim().max(20).nullish(),
  city: z.string().trim().max(80).nullish(),
  address: z.string().trim().max(300).nullish(),
  isActive: z.boolean().optional(),
});

// ─────────────── الأشخاص ───────────────

export const personInputSchema = z.object({
  fullName: z.string().trim().min(2, 'الاسم مطلوب').max(160),
  /** هوية أو إقامة — يُخزَّن مشفَّرًا. القاعدة الثابتة رقم ٤. */
  nationalId: z
    .string()
    .trim()
    .regex(/^[12]\d{9}$/, 'رقم الهوية أو الإقامة يجب أن يكون ١٠ أرقام يبدأ بـ ١ أو ٢')
    .nullish(),
  nationality: z.string().trim().max(80).nullish(),
  jobTitle: z.string().trim().max(120).nullish(),
  isActive: z.boolean().optional(),
});

// ─────────────── أنواع التراخيص الخاصة بالمستأجر ───────────────

export const licenseTypeInputSchema = z.object({
  nameAr: z.string().trim().min(2, 'الاسم العربي مطلوب').max(160),
  nameEn: z.string().trim().max(160).nullish(),
  code: z.string().trim().min(2).max(64).nullish(),
  authority: z.string().trim().max(160).nullish(),
  holderType: z.enum(HOLDER_TYPES),
  defaultDurationMo: z.number().int().min(1).max(600).nullish(),
  defaultCalendar: z.enum(CALENDAR_TYPES).optional(),
  typicalPenaltyNote: z.string().trim().max(300).nullish(),
  renewalUrl: z.string().url('رابط غير صالح').max(500).nullish(),
  sortOrder: z.number().int().optional(),
});

// ─────────────── الترخيص ───────────────

/** الفترة: مشتركة بين الإنشاء والتجديد */
const periodInputSchema = z.object({
  issueDate: isoDate.nullish(),
  expiryDate: isoDate,
  expiryHijri: hijriDate.nullish(),
  sourceCalendar: z.enum(CALENDAR_TYPES).default('GREGORIAN'),
  cost: z.number().nonnegative().max(99_999_999).nullish(),
});

export const createLicenseSchema = z
  .object({
    licenseTypeId: z.string().min(1, 'نوع الترخيص مطلوب'),
    facilityId: z.string().min(1).nullish(),
    personId: z.string().min(1).nullish(),
    number: z.string().trim().max(64).nullish(),
    label: z.string().trim().max(160).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .merge(periodInputSchema)
  // يطابق قيد License_one_holder_chk في قاعدة البيانات — نرفضه هنا
  // برسالة عربية مفهومة بدل أن يصل المستخدم إلى خطأ SQL خام.
  .refine((v) => !!v.facilityId !== !!v.personId, {
    message: 'الترخيص يرتبط بفرع أو بشخص، لا بكليهما ولا بلا أحد',
    path: ['facilityId'],
  });

/** التعديل لا يمسّ التواريخ — تلك تتغير بالتجديد وحده */
export const updateLicenseSchema = z.object({
  number: z.string().trim().max(64).nullish(),
  label: z.string().trim().max(160).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  licenseTypeId: z.string().min(1).optional(),
  facilityId: z.string().min(1).nullish(),
  personId: z.string().min(1).nullish(),
  status: z.enum(['UNDER_RENEWAL', 'CANCELLED', 'ACTIVE']).optional(),
  isArchived: z.boolean().optional(),
});

export const renewLicenseSchema = periodInputSchema;

// ─────────────── الفلاتر ───────────────

export const licenseListQuerySchema = z.object({
  facilityId: z.string().optional(),
  personId: z.string().optional(),
  licenseTypeId: z.string().optional(),
  status: z.enum(LICENSE_STATUSES).optional(),
  /** بحث في الرقم أو التسمية أو اسم الحامل */
  q: z.string().trim().max(120).optional(),
  includeArchived: z.coerce.boolean().optional(),
  /** ينتهي خلال كذا يومًا — للوحة القيادة */
  expiringWithinDays: z.coerce.number().int().min(0).max(3650).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['expiry', 'created', 'name']).default('expiry'),
});

export type FacilityInput = z.infer<typeof facilityInputSchema>;
export type PersonInput = z.infer<typeof personInputSchema>;
export type LicenseTypeInput = z.infer<typeof licenseTypeInputSchema>;
export type CreateLicenseInput = z.infer<typeof createLicenseSchema>;
export type UpdateLicenseInput = z.infer<typeof updateLicenseSchema>;
export type RenewLicenseInput = z.infer<typeof renewLicenseSchema>;
export type LicenseListQuery = z.infer<typeof licenseListQuerySchema>;

// ─────────────── أشكال الردود ───────────────

export type DashboardSummary = {
  counts: Record<LicenseStatusValue, number>;
  /** ينتهي خلال ٣٠ يومًا — البطاقة البرتقالية */
  within30: number;
  /** ينتهي خلال ٦٠ يومًا — البطاقة الصفراء */
  within60: number;
  /** أقرب ١٠ انتهاءً — جدول «يحتاج انتباهك الآن» */
  attention: {
    id: string;
    typeName: string;
    number: string | null;
    holderName: string;
    expiryDate: string;
    expiryHijri: string | null;
    daysLeft: number;
    status: LicenseStatusValue;
  }[];
  /** نقاط الشريط الزمني لتسعين يومًا */
  timeline: { id: string; typeName: string; expiryDate: string; daysLeft: number }[];
  /** عدد الإشعارات التي فشل إرسالها — التنبيه العلوي في اللوحة */
  failedReminders: number;
};
