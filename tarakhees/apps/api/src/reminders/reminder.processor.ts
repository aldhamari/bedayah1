// ══════════════════════════════════════════════════════════════
//  apps/api/src/reminders/reminder.processor.ts
//
//  مستهلك الطابور: يبني الرسالة، يرسلها على كل قناة مفعّلة،
//  ويسجّل كل محاولة في NotificationLog (الجدول غير القابل للتعديل).
// ══════════════════════════════════════════════════════════════

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReminderChannel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationSenderRegistry } from './senders/sender.registry';
import { buildReminderMessage } from './reminder.templates';

type ReminderJobData = { reminderJobId: string };

@Processor('reminders', { concurrency: 10 })
export class ReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senders: NotificationSenderRegistry,
  ) {
    super();
  }

  async process(job: Job<ReminderJobData>) {
    const { reminderJobId } = job.data;

    const reminder = await this.prisma.reminderJob.findUnique({
      where: { id: reminderJobId },
      include: {
        period: {
          include: {
            license: {
              include: { licenseType: true, facility: true, person: true, tenant: true },
            },
          },
        },
      },
    });

    if (!reminder) {
      this.logger.warn(`المهمة ${reminderJobId} غير موجودة — تم حذفها؟`);
      return;
    }

    // حراسات: أي منها يعني أن التنبيه لم يعد ذا معنى
    if (reminder.status !== 'SCHEDULED') return;

    const { license } = reminder.period;
    if (!license.tenant.isActive) return this.cancel(reminder.id, 'المستأجر غير نشط');
    if (license.isArchived) return this.cancel(reminder.id, 'الترخيص مؤرشف');
    if (license.status === 'CANCELLED' || license.status === 'UNDER_RENEWAL') {
      return this.cancel(reminder.id, `حالة الترخيص ${license.status}`);
    }

    // إن جُدّد الترخيص بعد جدولة التنبيه، لم تعد الفترة هي الحالية
    if (!reminder.period.isCurrent) return this.cancel(reminder.id, 'الفترة جُدّدت');

    const message = buildReminderMessage({
      offsetDays: reminder.offsetDays,
      typeName: license.licenseType.nameAr,
      authority: license.licenseType.authority,
      holderName: license.facility?.name ?? license.person?.fullName ?? '—',
      number: license.number,
      expiryDate: reminder.period.expiryDate,
      expiryHijri: reminder.period.expiryHijri,
      penaltyNote: license.licenseType.typicalPenaltyNote,
      renewalUrl: license.licenseType.renewalUrl,
    });

    const targets = await this.resolveTargets(license.tenantId);
    if (targets.length === 0) {
      return this.cancel(reminder.id, 'لا يوجد مستقبلون مُهيّؤون');
    }

    let anySent = false;

    for (const target of targets) {
      const sender = this.senders.get(target.channel);
      let status: 'SENT' | 'FAILED' = 'SENT';
      let providerRef: string | null = null;
      let errorText: string | null = null;

      try {
        const result = await sender.send({
          recipient: target.recipient,
          body: message.body,
          templateKey: message.templateKey,
          variables: message.variables,
        });
        providerRef = result.providerRef ?? null;
        anySent = true;
      } catch (err) {
        status = 'FAILED';
        errorText = err instanceof Error ? err.message : String(err);
        this.logger.error(`فشل إرسال ${target.channel} إلى ${mask(target.recipient)}: ${errorText}`);
      }

      // نسجّل دائمًا — نجاحًا أو فشلًا. هذا السجل هو حجّتك
      // إن قال العميل لاحقًا "لم يصلني تنبيه".
      await this.prisma.notificationLog.create({
        data: {
          tenantId: license.tenantId,
          reminderId: reminder.id,
          channel: target.channel,
          recipient: target.recipient,
          bodySnapshot: message.body,
          status,
          providerRef,
          errorText,
        },
      });
    }

    // نجاح قناة واحدة يكفي لاعتبار التنبيه مُرسلًا
    if (anySent) {
      await this.prisma.reminderJob.update({
        where: { id: reminder.id },
        data: { status: 'SENT' },
      });
    } else {
      // نرمي الخطأ ليعيد BullMQ المحاولة (٣ مرات بتباعد متزايد)
      throw new Error(`فشل إرسال التنبيه ${reminder.id} على كل القنوات`);
    }
  }

  /** بعد استنفاد المحاولات — نعلّمها فاشلة لتظهر في لوحة المالك */
  async onFailed(job: Job<ReminderJobData>) {
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.prisma.reminderJob.update({
      where: { id: job.data.reminderJobId },
      data: { status: 'FAILED' },
    });
  }

  private async cancel(id: string, reason: string) {
    this.logger.debug(`إلغاء التنبيه ${id}: ${reason}`);
    await this.prisma.reminderJob.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /**
   * المستقبلون = أعضاء المستأجر بصلاحية OWNER أو MANAGER،
   * مضروبين في القنوات المفعّلة لديه.
   */
  private async resolveTargets(tenantId: string) {
    const [members, rules] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId, role: { in: ['OWNER', 'MANAGER'] } },
        include: { user: { select: { email: true, phone: true } } },
      }),
      this.prisma.reminderRule.findMany({
        where: { tenantId, isActive: true },
        select: { channel: true },
        distinct: ['channel'],
      }),
    ]);

    const targets: { channel: ReminderChannel; recipient: string }[] = [];

    for (const rule of rules) {
      for (const m of members) {
        const recipient =
          rule.channel === 'EMAIL' ? m.user.email
          : rule.channel === 'IN_APP' ? m.userId
          : m.user.phone; // WHATSAPP و SMS

        if (recipient) targets.push({ channel: rule.channel, recipient });
      }
    }

    // إزالة التكرار — قد يشترك عضوان بنفس البريد نظريًا
    return [...new Map(targets.map((t) => [`${t.channel}:${t.recipient}`, t])).values()];
  }
}

/** إخفاء جزئي للأرقام في السجلات — لا تكتب بيانات العملاء كاملة في اللوقات */
function mask(v: string): string {
  return v.length <= 4 ? '****' : `${v.slice(0, 3)}***${v.slice(-2)}`;
}
