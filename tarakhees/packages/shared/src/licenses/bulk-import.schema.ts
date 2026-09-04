// ══════════════════════════════════════════════════════════════
//  packages/shared/src/licenses/bulk-import.schema.ts
//
//  عقد واحد للاستيراد الجماعي، تستورده الواجهة والـ API معًا
//  فلا ينحرف أحدهما عن الآخر.
// ══════════════════════════════════════════════════════════════

import { z } from 'zod';

/** حد أعلى للدفعة — يحمي من لصق ملف ضخم يعلّق الطلب */
export const BULK_IMPORT_MAX_ROWS = 200;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), 'تاريخ غير موجود');

export const bulkLicenseRowSchema = z.object({
  licenseTypeId: z.string().min(1, 'نوع الترخيص مطلوب'),
  holderId: z.string().min(1, 'الجهة أو الشخص مطلوب'),
  number: z.string().trim().max(64).nullish(),
  expiryDate: isoDate,
  expiryHijri: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  sourceCalendar: z.enum(['GREGORIAN', 'HIJRI']).default('GREGORIAN'),
  issueDate: isoDate.nullish(),
  cost: z.number().nonnegative().nullish(),
});

export const bulkImportSchema = z.object({
  licenses: z
    .array(bulkLicenseRowSchema)
    .min(1, 'لا توجد صفوف للحفظ')
    .max(BULK_IMPORT_MAX_ROWS, `الحد الأقصى ${BULK_IMPORT_MAX_ROWS} صف في المرة الواحدة`),
});

export type BulkLicenseRow = z.infer<typeof bulkLicenseRowSchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;

/** خطأ مرتبط بصف بعينه — الواجهة تستخدم index لتلوين الصف */
export type RowError = { index: number; field: string; message: string };

export type BulkImportResponse =
  | { ok: true; created: number }
  | { ok: false; errors: RowError[] };
