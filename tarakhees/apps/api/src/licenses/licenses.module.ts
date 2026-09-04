import { Module } from '@nestjs/common';
// JwtAuthGuard المستعمل في @UseGuards هنا يحقن TokenService و SuperAdminService،
// وهما من AuthModule — فبلا استيرادها يفشل بناء الحارس عند الإقلاع.
import { AuthModule } from '../auth/auth.module';
import { FieldCryptoService } from '../crypto/field-crypto.service';
import { DashboardController, DashboardService } from '../dashboard/dashboard.controller';
import { FacilitiesController, PersonsController } from '../holders/holders.controller';
import { HoldersService } from '../holders/holders.service';
import {
  LicenseTypesController,
  LicenseTypesService,
} from '../license-types/license-types.controller';
import {
  ReminderRulesController,
  ReminderRulesService,
} from '../settings/reminder-rules.controller';
// المتحكم الجاهز لـ POST /licenses/bulk يعيش مع خدمته في ملف واحد
import { LicensesBulkService, LicensesController } from './licenses-bulk.service';
import { LicenseRecordsController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  imports: [AuthModule],
  controllers: [
    LicensesController, // POST /licenses/bulk (جاهز)
    LicenseRecordsController, // GET/POST/PATCH /licenses (+ /:id/renew)
    FacilitiesController,
    PersonsController,
    LicenseTypesController,
    DashboardController,
    ReminderRulesController,
  ],
  providers: [
    LicensesService,
    LicensesBulkService,
    HoldersService,
    LicenseTypesService,
    DashboardService,
    ReminderRulesService,
    FieldCryptoService,
  ],
})
export class LicensesModule {}
