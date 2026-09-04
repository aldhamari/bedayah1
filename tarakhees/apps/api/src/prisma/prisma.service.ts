// ══════════════════════════════════════════════════════════════
//  apps/api/src/prisma/prisma.service.ts
//
//  عميل Prisma، مُمدَّد بامتداد عزل المستأجرين.
//
//  ★ لماذا يُرجع المُنشئ العميل الممدَّد بدل تخزينه في حقل؟
//    لأن الملفات الجاهزة تكتب `this.prisma.licensePeriod.findMany(...)`
//    مباشرة. لو وضعنا الممدَّد في حقل (مثل `prisma.db.licensePeriod`)
//    لبقي `this.prisma.licensePeriod` منفذًا غير محروس — وعاد العزل
//    إلى «تذكّر المطوّر». إرجاعه من المُنشئ يجعل الحارس هو الطريق
//    الوحيد: لا يوجد عميل غير محروس ليُستعمل بالخطأ.
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { tenantIsolation } from '../tenancy/tenant.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(ctx: TenantContextService) {
    super();
    // العميل الممدَّد وكيل (Proxy) يمرّر ما لا يعرفه إلى العميل الأصلي،
    // فتبقى $connect و $transaction و $executeRaw و onModuleInit متاحة.
    return this.$extends(tenantIsolation(ctx)) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('اتصال قاعدة البيانات جاهز — عزل المستأجرين مفعّل');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
