// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/super-admin.service.ts
//
//  المهمة ٤ تطلب POST /admin/reminders/run بصلاحية SUPER_ADMIN،
//  لكن MemberRole في schema.prisma لا يحوي إلا OWNER/MANAGER/VIEWER
//  ولا يوجد حقل isSuperAdmin على User.
//
//  المخطط ملف جاهز لا أُعدّله بلا إذن، فمصدر هذه الصلاحية متغير بيئة
//  بقائمة بُرد إلكترونية. هذا مقبول لأنه دور تشغيلي لفريقك أنت،
//  لا صلاحية يمنحها عميل لعميل. إن أردته في القاعدة، أطلب الإذن
//  بإضافة حقل إلى User.
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SuperAdminService {
  private readonly emails: Set<string>;

  constructor(config: ConfigService) {
    this.emails = new Set(
      (config.get<string>('SUPER_ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );

    if (this.emails.size === 0) {
      new Logger(SuperAdminService.name).log(
        'لا يوجد مشرف منصة — اضبط SUPER_ADMIN_EMAILS لتفعيل مسارات /admin',
      );
    }
  }

  is(email: string | null | undefined): boolean {
    return !!email && this.emails.has(email.toLowerCase());
  }
}
