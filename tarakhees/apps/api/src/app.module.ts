import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RemindersModule } from './reminders/reminders.module';

// الوحدات القادمة (لا تُضف قبل بنائها في مهامها):
//   AuthModule       ← المهمة ٣
//   LicensesModule   ← المهمة ٤ (وفيها LicensesBulkController الموجود)
//   DashboardModule  ← المهمة ٤

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    RemindersModule,
  ],
})
export class AppModule {}
