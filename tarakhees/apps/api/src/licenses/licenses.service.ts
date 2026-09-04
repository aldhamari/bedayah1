// ══════════════════════════════════════════════════════════════
//  apps/api/src/licenses/licenses.service.ts
//
//  ★ قاعدة التجديد الحرجة: لا يُعدَّل سجل فترة قديم أبدًا.
//    التجديد يضبط isCurrent=false و closedAt على الفترة الحالية،
//    ثم ينشئ فترة جديدة. سجل الفترات هو ما يبني القيمة التراكمية
//    للعميل، وتعديل الماضي يمحوها.
// ══════════════════════════════════════════════════════════════

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import type {
  CreateLicenseInput,
  LicenseListQuery,
  RenewLicenseInput,
  UpdateLicenseInput,
} from '@repo/shared/licenses/license.schema';
import type { AuthUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  daysBetween,
  normalizeExpiryDate,
  riyadhToday,
} from '../reminders/reminder-scheduler.service';
import { toHijriString } from './hijri.util';

/** ما يُعرض في القوائم — لا نُعيد الكيان كاملًا بلا داعٍ */
const LIST_SELECT = {
  id: true,
  number: true,
  label: true,
  status: true,
  currentExpiry: true,
  isArchived: true,
  licenseType: { select: { id: true, nameAr: true, authority: true, renewalUrl: true } },
  facility: { select: { id: true, name: true } },
  person: { select: { id: true, fullName: true } },
  periods: {
    where: { isCurrent: true },
    select: { id: true, expiryDate: true, expiryHijri: true, issueDate: true, cost: true },
    take: 1,
  },
} satisfies Prisma.LicenseSelect;

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────
  //  GET /licenses
  // ─────────────────────────────────────────────────────────

  async list(query: LicenseListQuery) {
    const today = riyadhToday();

    // لا tenantId هنا — يحقنه امتداد Prisma. راجع tenant.extension.ts
    const where: Prisma.LicenseWhereInput = {
      ...(query.includeArchived ? {} : { isArchived: false }),
      ...(query.facilityId ? { facilityId: query.facilityId } : {}),
      ...(query.personId ? { personId: query.personId } : {}),
      ...(query.licenseTypeId ? { licenseTypeId: query.licenseTypeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.expiringWithinDays !== undefined
        ? { currentExpiry: { not: null, lte: addDays(today, query.expiringWithinDays) } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { label: { contains: query.q, mode: 'insensitive' } },
              { facility: { name: { contains: query.q, mode: 'insensitive' } } },
              { person: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { licenseType: { nameAr: { contains: query.q } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.LicenseOrderByWithRelationInput =
      query.sort === 'created'
        ? { createdAt: 'desc' }
        : query.sort === 'name'
          ? { licenseType: { nameAr: 'asc' } }
          : // الافتراضي: الأقرب انتهاءً أولًا، والذي بلا تاريخ في آخر القائمة
            { currentExpiry: { sort: 'asc', nulls: 'last' } };

    const [total, rows] = await Promise.all([
      this.prisma.license.count({ where }),
      this.prisma.license.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((r) => this.toListItem(r, today)),
    };
  }

  // ─────────────────────────────────────────────────────────
  //  GET /licenses/:id  — التفاصيل + سجل الفترات + سجل التنبيهات
  // ─────────────────────────────────────────────────────────

  async findOne(id: string) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: {
        licenseType: true,
        facility: { select: { id: true, name: true, city: true } },
        person: { select: { id: true, fullName: true, jobTitle: true } },
        periods: {
          orderBy: { expiryDate: 'desc' },
          include: {
            documents: {
              select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
            },
          },
        },
      },
    });

    if (!license) throw new NotFoundException('الترخيص غير موجود');

    const today = riyadhToday();

    // سجل التنبيهات: ما أُرسل فعلًا، لمن، متى، وهل وصل.
    // NotificationLog للإضافة فقط (القاعدة الثابتة رقم ٢) — قراءة لا غير.
    const reminders = await this.prisma.reminderJob.findMany({
      where: { periodId: { in: license.periods.map((p) => p.id) } },
      orderBy: { dueOn: 'desc' },
      include: {
        deliveries: {
          orderBy: { sentAt: 'desc' },
          select: {
            id: true,
            channel: true,
            recipient: true,
            status: true,
            errorText: true,
            sentAt: true,
            bodySnapshot: true,
          },
        },
      },
    });

    const current = license.periods.find((p) => p.isCurrent) ?? null;

    return {
      id: license.id,
      number: license.number,
      label: license.label,
      notes: license.notes,
      status: license.status,
      isArchived: license.isArchived,
      createdAt: license.createdAt,
      licenseType: license.licenseType,
      holder: license.facility
        ? { kind: 'FACILITY' as const, id: license.facility.id, name: license.facility.name }
        : license.person
          ? { kind: 'PERSON' as const, id: license.person.id, name: license.person.fullName }
          : null,
      current: current && {
        ...current,
        daysLeft: daysBetween(current.expiryDate, today),
      },
      /** كل تجديد سابق بتواريخه وتكلفته ومرفقه — هذا ما يبني القيمة التراكمية */
      periods: license.periods.map((p) => ({
        ...p,
        daysLeft: daysBetween(p.expiryDate, today),
      })),
      reminders,
    };
  }

  // ─────────────────────────────────────────────────────────
  //  POST /licenses
  // ─────────────────────────────────────────────────────────

  async create(user: AuthUser, input: CreateLicenseInput) {
    const type = await this.prisma.licenseType.findUnique({
      where: { id: input.licenseTypeId },
      select: { id: true, holderType: true, isActive: true },
    });

    if (!type || !type.isActive) throw new BadRequestException('نوع ترخيص غير معروف');

    await this.assertHolderMatches(type.holderType, input.facilityId, input.personId);

    const period = this.buildPeriodData(input);
    const today = riyadhToday();

    return this.prisma.$transaction(async (tx) => {
      const license = await tx.license.create({
        data: {
          licenseTypeId: input.licenseTypeId,
          facilityId: input.facilityId ?? null,
          personId: input.personId ?? null,
          number: input.number ?? null,
          label: input.label ?? null,
          notes: input.notes ?? null,
          currentExpiry: period.expiryDate,
          status: deriveStatus(period.expiryDate, today),
        } as never,
        select: { id: true },
      });

      await tx.licensePeriod.create({
        data: { ...period, licenseId: license.id, isCurrent: true } as never,
      });

      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'license.created',
          entityType: 'License',
          entityId: license.id,
          diff: { expiryDate: period.expiryDate.toISOString().slice(0, 10) },
        } as never,
      });

      return license;
    });
  }

  // ─────────────────────────────────────────────────────────
  //  PATCH /licenses/:id  — البيانات الأساسية فقط
  // ─────────────────────────────────────────────────────────

  async update(user: AuthUser, id: string, input: UpdateLicenseInput) {
    const existing = await this.prisma.license.findUnique({
      where: { id },
      select: { id: true, facilityId: true, personId: true, licenseTypeId: true, status: true },
    });
    if (!existing) throw new NotFoundException('الترخيص غير موجود');

    // تغيير الحامل أو النوع يجب أن يبقى متسقًا مع holderType والقيد في القاعدة
    const facilityId = input.facilityId !== undefined ? input.facilityId : existing.facilityId;
    const personId = input.personId !== undefined ? input.personId : existing.personId;

    if (input.facilityId !== undefined || input.personId !== undefined || input.licenseTypeId) {
      const type = await this.prisma.licenseType.findUnique({
        where: { id: input.licenseTypeId ?? existing.licenseTypeId },
        select: { holderType: true },
      });
      if (!type) throw new BadRequestException('نوع ترخيص غير معروف');
      await this.assertHolderMatches(type.holderType, facilityId, personId);
    }

    const updated = await this.prisma.license.update({
      where: { id },
      data: {
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.licenseTypeId ? { licenseTypeId: input.licenseTypeId } : {}),
        ...(input.facilityId !== undefined ? { facilityId: input.facilityId } : {}),
        ...(input.personId !== undefined ? { personId: input.personId } : {}),
        ...(input.status ? { status: input.status as LicenseStatus } : {}),
        ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
      },
      select: { id: true, status: true, isArchived: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.userId,
        action: 'license.updated',
        entityType: 'License',
        entityId: id,
        diff: input as Prisma.InputJsonValue,
      } as never,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────
  //  POST /licenses/:id/renew
  // ─────────────────────────────────────────────────────────

  async renew(user: AuthUser, id: string, input: RenewLicenseInput) {
    const license = await this.prisma.license.findUnique({
      where: { id },
      select: {
        id: true,
        isArchived: true,
        periods: { where: { isCurrent: true }, select: { id: true, expiryDate: true } },
      },
    });

    if (!license) throw new NotFoundException('الترخيص غير موجود');
    if (license.isArchived) throw new BadRequestException('الترخيص مؤرشف — أعِد تفعيله أولًا');

    const period = this.buildPeriodData(input);
    const currentPeriod = license.periods[0];

    if (currentPeriod && period.expiryDate <= currentPeriod.expiryDate) {
      throw new BadRequestException(
        'تاريخ انتهاء التجديد يجب أن يكون بعد تاريخ الفترة الحالية',
      );
    }

    const today = riyadhToday();

    return this.prisma.$transaction(async (tx) => {
      // ★ إغلاق الفترة الحالية — لا تعديل لأي حقل آخر فيها.
      //   تواريخها وتكلفتها ومرفقاتها تبقى كما هي إلى الأبد.
      if (currentPeriod) {
        await tx.licensePeriod.update({
          where: { id: currentPeriod.id },
          data: { isCurrent: false, closedAt: new Date() },
        });
      }

      // الفهرس الفريد الجزئي (المهمة ٢) يضمن ألا تنجح فترتان حاليتان
      // معًا لو ضغط المستخدم «جدّد» مرتين في نفس اللحظة.
      const created = await tx.licensePeriod.create({
        data: { ...period, licenseId: id, isCurrent: true } as never,
        select: { id: true, expiryDate: true, expiryHijri: true },
      });

      await tx.license.update({
        where: { id },
        data: {
          currentExpiry: period.expiryDate,
          status: deriveStatus(period.expiryDate, today),
        },
      });

      // التنبيهات المعلّقة على الفترة القديمة لم تعد ذات معنى.
      // المعالج يتحقق من isCurrent أيضًا، لكن الإلغاء هنا يُبقي
      // اللوحة نظيفة ولا يترك مهامًا معلّقة في الطابور بلا سبب.
      if (currentPeriod) {
        await tx.reminderJob.updateMany({
          where: { periodId: currentPeriod.id, status: 'SCHEDULED' },
          data: { status: 'CANCELLED' },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user.userId,
          action: 'period.renewed',
          entityType: 'License',
          entityId: id,
          diff: {
            previousPeriodId: currentPeriod?.id ?? null,
            previousExpiry: currentPeriod?.expiryDate.toISOString().slice(0, 10) ?? null,
            newExpiry: period.expiryDate.toISOString().slice(0, 10),
          },
        } as never,
      });

      return created;
    });
  }

  // ─────────────────────────────────────────────────────────
  //  أدوات
  // ─────────────────────────────────────────────────────────

  /**
   * القاعدة الثابتة رقم ١: كل تاريخ انتهاء منتصف ليل UTC.
   * نستعمل normalizeExpiryDate نفسها التي يستعملها المجدول، فلا
   * ينحرف ما يُحفظ عمّا يُقارَن به ليلًا.
   */
  private buildPeriodData(input: RenewLicenseInput | CreateLicenseInput) {
    const expiryDate = normalizeExpiryDate(input.expiryDate);
    const issueDate = input.issueDate ? normalizeExpiryDate(input.issueDate) : null;

    if (issueDate && issueDate >= expiryDate) {
      throw new BadRequestException('تاريخ الإصدار يجب أن يسبق تاريخ الانتهاء');
    }

    return {
      expiryDate,
      issueDate,
      // نحسب الهجري دائمًا حين لا يُرسَل، فتعرضه الواجهة مع الميلادي
      // (القاعدة الثابتة رقم ٣) بلا أن يكتبه المستخدم مرتين.
      expiryHijri: input.expiryHijri ?? toHijriString(expiryDate),
      sourceCalendar: input.sourceCalendar,
      cost: input.cost ?? null,
    };
  }

  private async assertHolderMatches(
    holderType: 'FACILITY' | 'PERSON',
    facilityId: string | null | undefined,
    personId: string | null | undefined,
  ) {
    if (holderType === 'FACILITY') {
      if (!facilityId) throw new BadRequestException('هذا النوع يرتبط بفرع لا بشخص');
      const found = await this.prisma.facility.findUnique({
        where: { id: facilityId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException('الفرع غير موجود لديك');
      return;
    }

    if (!personId) throw new BadRequestException('هذا النوع يرتبط بشخص لا بفرع');
    const found = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('الشخص غير موجود لديك');
  }

  private toListItem(row: Prisma.LicenseGetPayload<{ select: typeof LIST_SELECT }>, today: Date) {
    const period = row.periods[0] ?? null;
    return {
      id: row.id,
      number: row.number,
      label: row.label,
      status: row.status,
      isArchived: row.isArchived,
      typeName: row.licenseType.nameAr,
      authority: row.licenseType.authority,
      renewalUrl: row.licenseType.renewalUrl,
      holderName: row.facility?.name ?? row.person?.fullName ?? '—',
      holderKind: row.facility ? ('FACILITY' as const) : ('PERSON' as const),
      expiryDate: period?.expiryDate ?? row.currentExpiry,
      expiryHijri: period?.expiryHijri ?? null,
      cost: period?.cost ?? null,
      daysLeft: period ? daysBetween(period.expiryDate, today) : null,
    };
  }
}

/** نفس منطق المجدول حرفيًا — الحالة المحفوظة يجب ألا تختلف عمّا يحسبه ليلًا */
export function deriveStatus(expiry: Date, today: Date): LicenseStatus {
  const days = daysBetween(expiry, today);
  if (days < 0) return LicenseStatus.EXPIRED;
  if (days <= 60) return LicenseStatus.EXPIRING_SOON;
  return LicenseStatus.ACTIVE;
}
