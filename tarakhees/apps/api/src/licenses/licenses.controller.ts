// ══════════════════════════════════════════════════════════════
//  apps/api/src/licenses/licenses.controller.ts
//
//  ملاحظة على التسمية: الاسم `LicensesController` مأخوذ سلفًا في
//  licenses-bulk.service.ts (ملف جاهز يحمل الخدمة والمتحكم معًا)،
//  وهو يخدم POST /licenses/bulk. هذا المتحكم يخدم بقية المسارات
//  تحت نفس البادئة، ولا تتعارض المسارات بينهما.
// ══════════════════════════════════════════════════════════════

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createLicenseSchema,
  licenseListQuerySchema,
  renewLicenseSchema,
  updateLicenseSchema,
} from '@repo/shared/licenses/license.schema';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { parse } from '../common/zod.util';
import { LicensesService } from './licenses.service';

@Controller('licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicenseRecordsController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.licenses.list(parse(licenseListQuerySchema, query));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.licenses.findOne(id);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.licenses.create(user, parse(createLicenseSchema, body));
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.licenses.update(user, id, parse(updateLicenseSchema, body));
  }

  @Post(':id/renew')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(200)
  renew(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return this.licenses.renew(user, id, parse(renewLicenseSchema, body));
  }
}
