// ══════════════════════════════════════════════════════════════
//  apps/api/src/reminders/reminders.module.ts
// ══════════════════════════════════════════════════════════════

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderProcessor } from './reminder.processor';
import {
  NotificationSenderRegistry,
  WhatsAppSender,
  EmailSender,
  SmsSender,
  InAppSender,
} from './senders';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST') ?? 'localhost',
          port: Number(config.get('REDIS_PORT') ?? 6379),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: 'reminders' }),
  ],
  providers: [
    ReminderSchedulerService,
    ReminderProcessor,
    NotificationSenderRegistry,
    WhatsAppSender,
    EmailSender,
    SmsSender,
    InAppSender,
  ],
  exports: [ReminderSchedulerService],
})
export class RemindersModule {}

/* ══════════════════════════════════════════════════════════════

## متغيرات البيئة

```env
# Redis (للطابور)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# واتساب — Meta Cloud API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_TOKEN=
WHATSAPP_API_VERSION=v21.0

# البريد
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="نظام التراخيص <no-reply@example.sa>"

# الرسائل النصية
SMS_API_URL=
SMS_API_KEY=
SMS_SENDER_NAME=
```

أضف Redis إلى docker-compose بجانب Postgres:

```yaml
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    command: redis-server --appendonly yes
    volumes: [redis-data:/data]
```

## التشغيل والاختبار محليًا

لا تنتظر السابعة صباحًا. اكشف نقطة تشغيل يدوية محمية بصلاحية المشرف:

```ts
@Post('admin/reminders/run')
@Roles('SUPER_ADMIN')
run(@Query('date') date?: string) {
  return this.scheduler.execute(date ? new Date(date) : new Date());
}
```

ثم اختبر السيناريوهات الأربعة الحرجة:

1. **يوم بعد يوم** — شغّلها بتواريخ متتابعة وتأكد أن كل مهلة أطلقت
   تنبيهًا واحدًا فقط لا أكثر.
2. **إعادة التشغيل** — نفّذها مرتين بنفس التاريخ. يجب أن تكون
   الثانية بلا أي أثر (createdJobs = 0). هذا اختبار القيد الفريد.
3. **التجديد أثناء الانتظار** — أنشئ تنبيهًا، جدّد الترخيص، ثم شغّل
   الطابور. يجب أن يُلغى التنبيه لا أن يُرسل.
4. **يوم مفقود** — أوقف الخدمة يومين ثم شغّلها. المهام الفائتة
   (dueOn أقدم من اليوم) يجب أن تُرسل ولا تضيع.

## ملاحظة على التوسع

المجدول يفترض عملية واحدة. عند تشغيل أكثر من نسخة من الـ API،
ستتنافس النسخ على نفس الـ cron. الحل الأبسط: متغير بيئة
`SCHEDULER_ENABLED=true` على نسخة واحدة فقط. لا تعتمد على
القيد الفريد وحده كبديل عن ذلك — سيمنع الازدواج لكنه سيهدر
استعلامات متزامنة بلا داعٍ.

══════════════════════════════════════════════════════════════ */
