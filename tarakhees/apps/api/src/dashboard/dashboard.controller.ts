// ══════════════════════════════════════════════════════════════
//  apps/api/src/dashboard/dashboard.controller.ts
//
//  GET /dashboard/summary — كل ما تحتاجه لوحة القيادة في طلب واحد:
//  البطاقات الأربع، الشريط الزمني، جدول «يحتاج انتباهك»، وتنبيه
//  الإشعارات الفاشلة.
// ══════════════════════════════════════════════════════════════

import { Controller, Get, Injectable, UseGuards } from '@nestjs/common';
import type { DashboardSummary, LicenseStatusValue } from '@repo/shared/licenses/license.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, daysBetween, riyadhToday } from '../reminders/reminder-scheduler.service';

const TIMELINE_DAYS = 90;
const ATTENTION_LIMIT = 10;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<DashboardSummary> {
    const today = riyadhToday();
    const active = { isArchived: false };

    const [grouped, within30, within60, attention, timeline, failedReminders] = await Promise.all([
      this.prisma.license.groupBy({ by: ['status'], where: active, _count: true }),

      this.prisma.license.count({
        where: { ...active, currentExpiry: { gte: today, lte: addDays(today, 30) } },
      }),
      this.prisma.license.count({
        where: { ...active, currentExpiry: { gte: today, lte: addDays(today, 60) } },
      }),

      // «يحتاج انتباهك الآن»: المنتهي والمقترب معًا، الأقرب أولًا
      this.prisma.license.findMany({
        where: {
          ...active,
          status: { in: ['EXPIRED', 'EXPIRING_SOON'] },
          currentExpiry: { not: null },
        },
        orderBy: { currentExpiry: 'asc' },
        take: ATTENTION_LIMIT,
        select: {
          id: true,
          number: true,
          status: true,
          currentExpiry: true,
          licenseType: { select: { nameAr: true } },
          facility: { select: { name: true } },
          person: { select: { fullName: true } },
          periods: { where: { isCurrent: true }, select: { expiryHijri: true }, take: 1 },
        },
      }),

      this.prisma.license.findMany({
        where: {
          ...active,
          status: { notIn: ['CANCELLED'] },
          currentExpiry: { gte: today, lte: addDays(today, TIMELINE_DAYS) },
        },
        orderBy: { currentExpiry: 'asc' },
        select: {
          id: true,
          currentExpiry: true,
          licenseType: { select: { nameAr: true } },
        },
      }),

      // التنبيه العلوي: إشعار فشل إرساله يعني أن العميل قد لا يعلم
      // بانتهاء ترخيصه — وهو أسوأ ما يمكن أن يحدث في هذا المنتج.
      this.prisma.reminderJob.count({ where: { status: 'FAILED' } }),
    ]);

    const counts = {
      ACTIVE: 0,
      EXPIRING_SOON: 0,
      EXPIRED: 0,
      UNDER_RENEWAL: 0,
      CANCELLED: 0,
    } as Record<LicenseStatusValue, number>;

    for (const row of grouped) counts[row.status as LicenseStatusValue] = row._count;

    return {
      counts,
      within30,
      within60,
      attention: attention.map((l) => ({
        id: l.id,
        typeName: l.licenseType.nameAr,
        number: l.number,
        holderName: l.facility?.name ?? l.person?.fullName ?? '—',
        expiryDate: l.currentExpiry!.toISOString().slice(0, 10),
        expiryHijri: l.periods[0]?.expiryHijri ?? null,
        daysLeft: daysBetween(l.currentExpiry!, today),
        status: l.status as LicenseStatusValue,
      })),
      timeline: timeline.map((l) => ({
        id: l.id,
        typeName: l.licenseType.nameAr,
        expiryDate: l.currentExpiry!.toISOString().slice(0, 10),
        daysLeft: daysBetween(l.currentExpiry!, today),
      })),
      failedReminders,
    };
  }
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }
}
