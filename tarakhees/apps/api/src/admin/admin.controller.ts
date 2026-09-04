// ══════════════════════════════════════════════════════════════
//  apps/api/src/admin/admin.controller.ts
//
//  POST /admin/reminders/run — تشغيل يدوي للمجدول (SUPER_ADMIN فقط).
//  «لا تنتظر السابعة صباحًا» كما في نهاية reminders.module.ts.
// ══════════════════════════════════════════════════════════════

import { BadRequestException, Controller, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { ReminderSchedulerService } from '../reminders/reminder-scheduler.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly scheduler: ReminderSchedulerService,
    private readonly ctx: TenantContextService,
  ) {}

  @Post('reminders/run')
  @Roles('SUPER_ADMIN')
  @HttpCode(200)
  run(@Query('date') date?: string) {
    const at = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException('تاريخ غير صالح — استخدم الصيغة YYYY-MM-DD');
    }

    // ★ ضروري: المجدول عابر للمستأجرين بطبيعته (يمرّ على كل المنشآت).
    //   لكنه هنا يعمل داخل طلب HTTP له سياق مستأجر، فلولا runAsSystem
    //   لحصر الامتداد استعلاماته في منشأة المشرف وحدها — فيبدو أنه
    //   عمل بينما لم يُنبَّه أحد سواها.
    return this.ctx.runAsSystem(() => this.scheduler.execute(at));
  }
}
