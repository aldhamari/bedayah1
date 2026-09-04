// ══════════════════════════════════════════════════════════════
//  apps/api/src/license-types/license-types.controller.ts
//
//  الكتالوج: أنواع عامة (tenantId = null) يراها الجميع، وأنواع
//  خاصة بالمستأجر يضيفها بنفسه. امتداد العزل يتكفل بالتمييز:
//  القراءة ترى العام + الخاص، والكتابة تصيب الخاص وحده.
// ══════════════════════════════════════════════════════════════

import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { HolderType } from '@prisma/client';
import { licenseTypeInputSchema } from '@repo/shared/licenses/license.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parse } from '../common/zod.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LicenseTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(holderType?: HolderType, includeInactive = false) {
    const rows = await this.prisma.licenseType.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(holderType ? { holderType } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    });

    // الواجهة تحتاج التمييز لتمنع تعديل العام
    return rows.map((t) => ({ ...t, isGlobal: t.tenantId === null }));
  }

  async get(id: string) {
    const type = await this.prisma.licenseType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('نوع الترخيص غير موجود');
    return { ...type, isGlobal: type.tenantId === null };
  }

  create(input: unknown) {
    const data = parse(licenseTypeInputSchema, input);
    return this.prisma.licenseType.create({
      data: {
        ...data,
        // الرمز يجب أن يكون فريدًا عالميًا في المخطط، فنُميّز الخاص
        code: data.code ?? `T_${Date.now().toString(36).toUpperCase()}`,
      } as never,
    });
  }

  async update(id: string, input: unknown) {
    const { code, ...data } = parse(licenseTypeInputSchema.partial(), input);
    await this.assertOwned(id);

    // `code` غير قابل للإفراغ في المخطط، وهو مفتاح upsert البذور —
    // فتغييره لاحقًا يفصل النوع عن تاريخه. يُضبط عند الإنشاء فقط.
    return this.prisma.licenseType.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    await this.assertOwned(id);
    return this.prisma.licenseType.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * الامتداد يمنع الكتابة على الأنواع العامة أصلًا (يرمي P2025)،
   * لكن رسالة عربية واضحة أفضل من خطأ Prisma للمستخدم.
   */
  private async assertOwned(id: string) {
    const type = await this.prisma.licenseType.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!type) throw new NotFoundException('نوع الترخيص غير موجود');
    if (type.tenantId === null) {
      throw new NotFoundException('لا يمكن تعديل نوع من الكتالوج العام — أنشئ نوعًا خاصًا بك');
    }
  }
}

@Controller('license-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicenseTypesController {
  constructor(private readonly types: LicenseTypesService) {}

  @Get()
  list(
    @Query('holderType') holderType?: HolderType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.types.list(holderType, includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.types.get(id);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@Body() body: unknown) {
    return this.types.create(body);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.types.update(id, body);
  }

  @Delete(':id')
  @Roles('OWNER')
  deactivate(@Param('id') id: string) {
    return this.types.deactivate(id);
  }
}
