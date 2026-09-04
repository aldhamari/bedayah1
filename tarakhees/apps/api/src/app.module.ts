import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RemindersModule } from './reminders/reminders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

// الوحدات القادمة (لا تُضف قبل بنائها في مهامها):
//   LicensesModule   ← المهمة ٤ (وفيها LicensesBulkController الموجود)
//   DashboardModule  ← المهمة ٤

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    RemindersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // يفتح سياق ALS قبل الحرّاس، فيملؤه JwtAuthGuard بعد التحقق.
    // على كل المسارات بلا استثناء: مسار بلا سياق = مسار بلا عزل.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
