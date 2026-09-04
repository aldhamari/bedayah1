import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * عميل Prisma الأساسي.
 *
 * ⚠️ عزل المستأجرين (Prisma Client Extension الذي يحقن `tenantId` تلقائيًا)
 *    يُضاف في المهمة ٣ — هو شرط غير قابل للتفاوض في CLAUDE.md.
 *    حتى ذلك الحين كل استعلام مسؤول عن تمرير `tenantId` بنفسه.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('اتصال قاعدة البيانات جاهز');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
