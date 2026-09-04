import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin/admin.controller';
import { AuthModule } from './auth/auth.module';
import { LicensesModule } from './licenses/licenses.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RemindersModule } from './reminders/reminders.module';
import { TenantContextMiddleware } from './tenancy/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    RemindersModule,
    LicensesModule,
  ],
  // AdminController هنا لا في وحدة مستقلة: يحتاج ReminderSchedulerService
  // الذي تُصدّره RemindersModule، ولا يستحق وحدة كاملة لمسار واحد.
  controllers: [AdminController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // يفتح سياق ALS قبل الحرّاس، فيملؤه JwtAuthGuard بعد التحقق.
    // على كل المسارات بلا استثناء: مسار بلا سياق = مسار بلا عزل.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
