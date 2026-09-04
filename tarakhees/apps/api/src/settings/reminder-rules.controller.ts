// ══════════════════════════════════════════════════════════════
//  apps/api/src/settings/reminder-rules.controller.ts
//
//  مهل التنبيه وقنواتها — شاشة «الإعدادات» في المهمة ٥.
//
//  ملاحظة نطاق: هذا المسار ليس ضمن القائمة الحرفية في المهمة ٤،
//  لكن شاشة الإعدادات لا يمكن بناؤها بدونه، والمهمة ٥ واجهات فقط.
//  (إدارة المستخدمين موجودة أصلًا في /auth/members.)
// ══════════════════════════════════════════════════════════════

import { Body, Controller, Delete, Get, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { ReminderChannel } from '@prisma/client';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parse } from '../common/zod.util';
import { PrismaService } from '../prisma/prisma.service';

const ruleSchema = z.object({
  /** سالب = متابعة بعد الانتهاء، صفر = يوم الانتهاء نفسه */
  offsetDays: z.number().int().min(-90).max(365),
  channel: z.nativeEnum(ReminderChannel),
  isActive: z.boolean().default(true),
});

@Injectable()
export class ReminderRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.reminderRule.findMany({
      orderBy: [{ offsetDays: 'desc' }, { channel: 'asc' }],
    });
  }

  /**
   * لا نستعمل upsert هنا: مفتاحه المركّب (tenantId, offsetDays, channel)
   * يتضمن tenantId، والامتداد يحقنه في المستوى الأعلى لا داخل المفتاح —
   * فيبحث بمستأجر فارغ. البحث ثم الإنشاء/التحديث أوضح وأصحّ.
   */
  async save(input: unknown) {
    const data = parse(ruleSchema, input);

    const existing = await this.prisma.reminderRule.findFirst({
      where: { offsetDays: data.offsetDays, channel: data.channel },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.reminderRule.update({
        where: { id: existing.id },
        data: { isActive: data.isActive },
      });
    }

    return this.prisma.reminderRule.create({ data: data as never });
  }

  remove(id: string) {
    return this.prisma.reminderRule.delete({ where: { id } });
  }
}

@Controller('settings/reminder-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReminderRulesController {
  constructor(private readonly rules: ReminderRulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  save(@Body() body: unknown) {
    return this.rules.save(body);
  }

  @Delete(':id')
  @Roles('OWNER')
  remove(@Param('id') id: string) {
    return this.rules.remove(id);
  }
}
