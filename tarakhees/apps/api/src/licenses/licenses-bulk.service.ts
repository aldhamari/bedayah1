// ══════════════════════════════════════════════════════════════
//  apps/api/src/licenses/licenses-bulk.service.ts  (+ controller في الأسفل)
//
//  الاستيراد الجماعي: يتحقق من كل الصفوف أولًا، فإن كان فيها خطأ واحد
//  لم يُكتب شيء إطلاقًا. النجاح الجزئي هنا مربك — العميل لن يعرف
//  أي صف حُفظ وأيها لا، فيلصق الملف مرة أخرى ويُنشئ نسخًا مكررة.
// ══════════════════════════════════════════════════════════════

import {
  Body,
  Controller,
  ForbiddenException,
  Injectable,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  bulkImportSchema,
  type BulkImportInput,
  type BulkImportResponse,
  type BulkLicenseRow,
  type RowError,
} from '@repo/shared/licenses/bulk-import.schema';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

const DAY_MS = 86_400_000;

@Injectable()
export class LicensesBulkService {
  constructor(private readonly prisma: PrismaService) {}

  async import(user: AuthUser, input: BulkImportInput): Promise<BulkImportResponse> {
    const { tenantId } = user;
    const rows = input.licenses;

    // ── ١. جلب كل ما نحتاجه للتحقق في ثلاثة استعلامات، لا استعلام لكل صف ──

    const [types, facilities, persons] = await Promise.all([
      this.prisma.licenseType.findMany({
        where: {
          id: { in: unique(rows.map((r) => r.licenseTypeId)) },
          isActive: true,
          OR: [{ tenantId: null }, { tenantId }], // عام أو خاص بهذا المستأجر فقط
        },
        select: { id: true, holderType: true, nameAr: true },
      }),
      this.prisma.facility.findMany({
        where: { tenantId, id: { in: unique(rows.map((r) => r.holderId)) } },
        select: { id: true },
      }),
      this.prisma.person.findMany({
        where: { tenantId, id: { in: unique(rows.map((r) => r.holderId)) } },
        select: { id: true },
      }),
    ]);

    const typeById = new Map(types.map((t) => [t.id, t]));
    const facilityIds = new Set(facilities.map((f) => f.id));
    const personIds = new Set(persons.map((p) => p.id));

    // ── ٢. التحقق صفًا صفًا ──

    const errors: RowError[] = [];
    const seenInBatch = new Set<string>();

    rows.forEach((row, index) => {
      const type = typeById.get(row.licenseTypeId);

      if (!type) {
        errors.push({ index, field: 'licenseTypeId', message: 'نوع ترخيص غير معروف' });
        return;
      }

      const holderExists =
        type.holderType === 'FACILITY' ? facilityIds.has(row.holderId) : personIds.has(row.holderId);

      if (!holderExists) {
        // نفس الرسالة سواء كان السجل غير موجود أو تابعًا لمستأجر آخر —
        // التمييز بينهما يكشف وجود سجلات لدى عملاء آخرين.
        errors.push({
          index,
          field: 'holderId',
          message:
            type.holderType === 'FACILITY'
              ? 'الفرع غير موجود لديك'
              : 'الشخص غير موجود لديك',
        });
        return;
      }

      if (row.issueDate && row.issueDate >= row.expiryDate) {
        errors.push({ index, field: 'issueDate', message: 'تاريخ الإصدار بعد الانتهاء' });
      }

      // تكرار داخل نفس الدفعة — يحدث حين يُلصق الملف مرتين
      const fingerprint = `${row.licenseTypeId}|${row.holderId}|${row.number ?? ''}`;
      if (seenInBatch.has(fingerprint)) {
        errors.push({ index, field: 'number', message: 'مكرر داخل نفس الدفعة' });
      }
      seenInBatch.add(fingerprint);
    });

    // ── ٣. تكرار مع ما هو محفوظ سابقًا ──

    const existing = await this.prisma.license.findMany({
      where: {
        tenantId,
        isArchived: false,
        OR: rows.map((r) => ({
          licenseTypeId: r.licenseTypeId,
          ...(r.number ? { number: r.number } : {}),
          ...(facilityIds.has(r.holderId)
            ? { facilityId: r.holderId }
            : { personId: r.holderId }),
        })),
      },
      select: { licenseTypeId: true, number: true, facilityId: true, personId: true },
    });

    const existingKeys = new Set(
      existing.map((e) => `${e.licenseTypeId}|${e.facilityId ?? e.personId}|${e.number ?? ''}`),
    );

    rows.forEach((row, index) => {
      if (existingKeys.has(`${row.licenseTypeId}|${row.holderId}|${row.number ?? ''}`)) {
        errors.push({ index, field: 'number', message: 'هذا الترخيص مسجّل لديك مسبقًا' });
      }
    });

    // ── ٤. حصة الاشتراك ──

    const [subscription, currentCount] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { tenantId } }),
      this.prisma.license.count({ where: { tenantId, isArchived: false } }),
    ]);

    if (subscription && currentCount + rows.length > subscription.licenseQuota) {
      throw new ForbiddenException(
        `باقتك تسمح بـ ${subscription.licenseQuota} ترخيصًا، ولديك ${currentCount}. ` +
          `هذه الدفعة تتجاوز الحد بـ ${currentCount + rows.length - subscription.licenseQuota}.`,
      );
    }

    if (errors.length > 0) {
      throw new UnprocessableEntityException({ ok: false, errors } satisfies BulkImportResponse);
    }

    // ── ٥. الكتابة في معاملة واحدة ──

    const today = startOfUtcDay(new Date());

    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const type = typeById.get(row.licenseTypeId)!;
        const expiry = toUtcMidnight(row.expiryDate);

        const license = await tx.license.create({
          data: {
            tenantId,
            licenseTypeId: row.licenseTypeId,
            facilityId: type.holderType === 'FACILITY' ? row.holderId : null,
            personId: type.holderType === 'PERSON' ? row.holderId : null,
            number: row.number ?? null,
            // نحسب الحالة الآن ولا ننتظر المهمة الليلية — وإلا ظهرت
            // كل التراخيص المستوردة "سارية" حتى الغد، ولو كان بعضها منتهيًا.
            status: deriveStatus(expiry, today),
            currentExpiry: expiry,
            periods: {
              create: {
                tenantId,
                issueDate: row.issueDate ? toUtcMidnight(row.issueDate) : null,
                expiryDate: expiry,
                expiryHijri: row.expiryHijri ?? null,
                sourceCalendar: row.sourceCalendar,
                cost: row.cost != null ? new Prisma.Decimal(row.cost) : null,
                isCurrent: true,
              },
            },
          },
          select: { id: true },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: user.userId,
            action: 'license.imported',
            entityType: 'License',
            entityId: license.id,
            diff: { source: 'bulk', typeName: type.nameAr, expiryDate: row.expiryDate },
          },
        });
      }
    });

    // ملاحظة مقصودة: لا نُنشئ مهام تنبيه هنا.
    // استيراد ١٥ ترخيصًا نصفها منتهٍ سيُطلق دفعة رسائل فورية تبدو كعُطل.
    // اللوحة تُظهر الحالة الحمراء فورًا، والمهمة الليلية تتكفل بالباقي.

    return { ok: true, created: rows.length };
  }
}

// ══════════════════════════════════════════════════════════════
//  apps/api/src/licenses/licenses.controller.ts
// ══════════════════════════════════════════════════════════════

@Controller('licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicensesController {
  constructor(private readonly bulk: LicensesBulkService) {}

  @Post('bulk')
  @Roles('OWNER', 'MANAGER')
  async importBulk(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<BulkImportResponse> {
    const parsed = bulkImportSchema.safeParse(body);

    if (!parsed.success) {
      const errors: RowError[] = parsed.error.issues.map((issue) => ({
        index: typeof issue.path[1] === 'number' ? issue.path[1] : -1,
        field: String(issue.path[2] ?? issue.path[0] ?? ''),
        message: issue.message,
      }));
      throw new UnprocessableEntityException({ ok: false, errors } satisfies BulkImportResponse);
    }

    return this.bulk.import(user, parsed.data);
  }
}

// ─────────────── أدوات ───────────────

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** يطابق normalizeExpiryDate في المجدول — منتصف ليل UTC كتمثيل ليوم تقويمي */
function toUtcMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function startOfUtcDay(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function deriveStatus(expiry: Date, today: Date) {
  const days = Math.round((expiry.getTime() - today.getTime()) / DAY_MS);
  if (days < 0) return 'EXPIRED' as const;
  if (days <= 60) return 'EXPIRING_SOON' as const;
  return 'ACTIVE' as const;
}
