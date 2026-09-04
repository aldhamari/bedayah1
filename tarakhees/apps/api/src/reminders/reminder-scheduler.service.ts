// ══════════════════════════════════════════════════════════════
//  apps/api/src/reminders/reminder-scheduler.service.ts
//
//  مهمة ليلية واحدة تعمل 07:00 بتوقيت الرياض:
//    ١. تعيد حساب حالة كل ترخيص (استعلام SQL واحد)
//    ٢. تنشئ مهام التنبيه المستحقة اليوم
//    ٣. تدفعها إلى الطابور للإرسال
//
//  الاعتماديات: @nestjs/schedule @nestjs/bullmq bullmq date-fns date-fns-tz
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';

const RIYADH = 'Asia/Riyadh';
const DAY_MS = 86_400_000;

/** أقصى مدى للمتابعة بعد الانتهاء (٩٠ يومًا = ١٢ تنبيه أسبوعي) */
const OVERDUE_MAX_WEEKS = 12;

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('reminders') private readonly queue: Queue,
  ) {}

  @Cron('0 7 * * *', { timeZone: RIYADH })
  async handleCron() {
    await this.execute();
  }

  /** منفصلة عن الـ cron لتكون قابلة للاستدعاء يدويًا وللاختبار */
  async execute(now: Date = new Date()) {
    const today = riyadhToday(now);
    this.logger.log(`بدء التشغيل ليوم ${toDateKey(today)}`);

    const statusCounts = await this.recomputeStatuses(today);
    const createdJobs = await this.createDueReminderJobs(today);
    const enqueued = await this.enqueuePending(today);

    this.logger.log(
      `اكتمل — حالات محدَّثة: ${statusCounts}، مهام جديدة: ${createdJobs}، مُرسَلة للطابور: ${enqueued}`,
    );
    return { statusCounts, createdJobs, enqueued };
  }

  // ─────────────────────────────────────────────────────────
  //  ١. إعادة حساب الحالات — استعلام واحد بدل حلقة
  // ─────────────────────────────────────────────────────────
  //  ملاحظة: لا نلمس UNDER_RENEWAL ولا CANCELLED — الأولى يضبطها
  //  المستخدم يدويًا، والثانية نهائية. الكتابة فوقهما تُفقد المستخدم ثقته.

  private async recomputeStatuses(today: Date): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE "License" l
      SET
        "currentExpiry" = p."expiryDate",
        "status" = CASE
          WHEN p."expiryDate" <  ${today} THEN 'EXPIRED'::"LicenseStatus"
          WHEN p."expiryDate" <= ${addDays(today, 60)} THEN 'EXPIRING_SOON'::"LicenseStatus"
          ELSE 'ACTIVE'::"LicenseStatus"
        END
      FROM "LicensePeriod" p
      WHERE p."licenseId" = l."id"
        AND p."isCurrent" = true
        AND l."isArchived" = false
        AND l."status" NOT IN ('UNDER_RENEWAL', 'CANCELLED')
        AND (
          l."currentExpiry" IS DISTINCT FROM p."expiryDate"
          OR l."status" IS DISTINCT FROM (
            CASE
              WHEN p."expiryDate" <  ${today} THEN 'EXPIRED'::"LicenseStatus"
              WHEN p."expiryDate" <= ${addDays(today, 60)} THEN 'EXPIRING_SOON'::"LicenseStatus"
              ELSE 'ACTIVE'::"LicenseStatus"
            END
          )
        )
    `;
  }

  // ─────────────────────────────────────────────────────────
  //  ٢. إنشاء مهام التنبيه المستحقة
  // ─────────────────────────────────────────────────────────
  //  بدل المرور على كل التراخيص وحساب المتبقي، نقلب المعادلة:
  //  لكل مهلة تنبيه نحسب تاريخ الانتهاء المستهدف مباشرة، فيستخدم
  //  الاستعلام الفهرس (tenantId, expiryDate) بدل مسح الجدول كاملًا.

  private async createDueReminderJobs(today: Date): Promise<number> {
    const rules = await this.prisma.reminderRule.findMany({
      where: { isActive: true, tenant: { isActive: true } },
      select: { tenantId: true, offsetDays: true },
    });

    // مهلة واحدة قد تكون بعدة قنوات — نوحّدها، لأن المهمة واحدة
    // لكل (فترة، مهلة) والقنوات تتفرع عند الإرسال.
    const byOffset = new Map<number, Set<string>>();
    for (const r of rules) {
      if (!byOffset.has(r.offsetDays)) byOffset.set(r.offsetDays, new Set());
      byOffset.get(r.offsetDays)!.add(r.tenantId);
    }

    // متابعة المتأخرات: كل ٧ أيام حتى ٩٠ يومًا
    const overdueTenants = new Set(rules.map((r) => r.tenantId));
    for (let w = 1; w <= OVERDUE_MAX_WEEKS; w++) {
      byOffset.set(-7 * w, overdueTenants);
    }

    let total = 0;

    for (const [offsetDays, tenantIds] of byOffset) {
      const targetDate = addDays(today, offsetDays);

      const periods = await this.prisma.licensePeriod.findMany({
        where: {
          isCurrent: true,
          expiryDate: targetDate,
          tenantId: { in: [...tenantIds] },
          license: {
            isArchived: false,
            status: { notIn: ['CANCELLED', 'UNDER_RENEWAL'] },
          },
        },
        select: { id: true, tenantId: true },
      });

      if (periods.length === 0) continue;

      // skipDuplicates يعتمد على القيد الفريد (periodId, offsetDays)
      // وهو ما يجعل إعادة تشغيل المهمة آمنة تمامًا.
      const res = await this.prisma.reminderJob.createMany({
        data: periods.map((p) => ({
          tenantId: p.tenantId,
          periodId: p.id,
          offsetDays,
          dueOn: today,
        })),
        skipDuplicates: true,
      });

      total += res.count;
    }

    return total;
  }

  // ─────────────────────────────────────────────────────────
  //  ٣. الدفع إلى الطابور
  // ─────────────────────────────────────────────────────────
  //  يشمل المهام الفائتة (dueOn أقدم من اليوم) — إن تعطل الخادم يومًا
  //  فسيلحق بها في اليوم التالي بدل أن تضيع.

  private async enqueuePending(today: Date): Promise<number> {
    const pending = await this.prisma.reminderJob.findMany({
      where: { status: 'SCHEDULED', dueOn: { lte: today } },
      select: { id: true },
      take: 5_000,
    });

    for (const job of pending) {
      await this.queue.add(
        'send-reminder',
        { reminderJobId: job.id },
        {
          jobId: job.id, // منع الازدواج على مستوى الطابور أيضًا
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: 1_000,
          removeOnFail: false,
        },
      );
    }

    return pending.length;
  }
}

// ══════════════════════════════════════════════════════════════
//  أدوات التاريخ
//
//  ★ قرار مهم: كل تواريخ الانتهاء تُخزَّن كمنتصف ليل UTC تمثيلًا
//    لتاريخ تقويمي، لا كلحظة زمنية. السعودية بلا توقيت صيفي (+03 ثابت)،
//    فبهذا التطبيع يصبح فرق الأيام قسمة بسيطة بلا أخطاء حدودية.
//    طبّق normalizeExpiryDate على كل إدخال قبل الحفظ.
// ══════════════════════════════════════════════════════════════

/** منتصف ليل UTC لليوم التقويمي الحالي في الرياض */
export function riyadhToday(now: Date = new Date()): Date {
  return new Date(`${formatInTimeZone(now, RIYADH, 'yyyy-MM-dd')}T00:00:00.000Z`);
}

/** يطبّع أي تاريخ قادم من الواجهة إلى منتصف ليل UTC */
export function normalizeExpiryDate(input: Date | string): Date {
  const key = typeof input === 'string' ? input.slice(0, 10) : input.toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00.000Z`);
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

export function daysBetween(target: Date, today: Date): number {
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
