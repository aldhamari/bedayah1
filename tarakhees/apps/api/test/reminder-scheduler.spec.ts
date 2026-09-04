// ══════════════════════════════════════════════════════════════
//  apps/api/test/reminder-scheduler.spec.ts
//
//  السيناريوهات الأربعة الحرجة الموصوفة في نهاية reminders.module.ts:
//    ١. يوم بعد يوم      — كل مهلة تُطلق تنبيهًا واحدًا لا أكثر
//    ٢. إعادة التشغيل    — التشغيل الثاني بلا أثر (createdJobs = 0)
//    ٣. التجديد أثناء الانتظار — التنبيه يُلغى لا يُرسل
//    ٤. يوم مفقود        — المهام الفائتة تُرسل ولا تضيع
//
//  يعمل على قاعدة بيانات حقيقية (نفس المخطط والقيود)، وطابور
//  وقنوات إرسال مزيّفة — الهدف اختبار منطق الجدولة لا الشبكة.
// ══════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReminderProcessor } from '../src/reminders/reminder.processor';
import {
  addDays,
  ReminderSchedulerService,
  riyadhToday,
} from '../src/reminders/reminder-scheduler.service';
import type { NotificationSenderRegistry } from '../src/reminders/senders';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

jest.setTimeout(60_000);

const TENANT_NAME = 'منشأة اختبار المجدول';

type QueuedJob = { name: string; data: { reminderJobId: string }; opts: { jobId?: string } };

/** طابور مزيّف: يسجّل ما دُفع إليه بدل الاتصال بـ Redis */
function fakeQueue() {
  const added: QueuedJob[] = [];
  const add = async (
    name: string,
    data: { reminderJobId: string },
    opts: { jobId?: string },
  ): Promise<void> => void added.push({ name, data, opts });

  return { queue: { add } as unknown as Queue, added };
}

/** سجل قنوات مزيّف: يسجّل كل إرسال ولا يتصل بأي مزوّد */
function fakeSenders() {
  const sent: { channel: string; recipient: string }[] = [];
  return {
    registry: {
      get: (channel: string) => ({
        send: async ({ recipient }: { recipient: string }) => {
          sent.push({ channel, recipient });
          return { providerRef: `fake-${sent.length}` };
        },
      }),
    } as unknown as NotificationSenderRegistry,
    sent,
  };
}

describe('ReminderSchedulerService — السيناريوهات الأربعة', () => {
  let raw: PrismaClient;
  let prisma: PrismaService;
  let ctx: TenantContextService;

  let tenantId: string;
  let facilityId: string;
  let licenseTypeId: string;

  beforeAll(async () => {
    ctx = new TenantContextService();
    // خارج أي طلب HTTP ⇒ سياق نظام ⇒ بلا حصر مستأجر،
    // وهو تمامًا ما يعمل به المجدول في الإنتاج.
    prisma = new PrismaService(ctx);
    raw = new PrismaClient();
    await raw.$connect();

    const type = await raw.licenseType.findFirstOrThrow({ where: { code: 'MUNICIPAL' } });
    licenseTypeId = type.id;
  });

  afterAll(async () => {
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await wipeTenant();

    const tenant = await raw.tenant.create({ data: { name: TENANT_NAME } });
    tenantId = tenant.id;

    const user = await raw.user.create({
      data: {
        email: `sched-${Date.now()}@example.sa`,
        fullName: 'مستقبل التنبيهات',
        phone: '966501234567',
        passwordHash: 'x',
      },
    });
    await raw.membership.create({ data: { tenantId, userId: user.id, role: 'OWNER' } });

    const facility = await raw.facility.create({ data: { tenantId, name: 'الفرع الرئيسي' } });
    facilityId = facility.id;

    // المهل الأربع الافتراضية، قناة واحدة تكفي لاختبار الجدولة
    await raw.reminderRule.createMany({
      data: [60, 30, 7, 0].map((offsetDays) => ({ tenantId, offsetDays, channel: 'EMAIL' as const })),
    });
  });

  afterEach(async () => {
    await wipeTenant();
    await raw.user.deleteMany({ where: { email: { startsWith: 'sched-' } } });
  });

  /**
   * ★ حذف المستأجر يتتالى إلى NotificationLog، وتريجر «الإضافة فقط»
   *   يمنع الحذف حتى لو جاء عبر التتالي — وهذا سلوك مقصود لا خلل:
   *   سجل «ماذا أُرسل ومتى» حجّتك التعاقدية، فلا يُمحى بحذف عابر.
   *
   *   النتيجة العملية: لا يمكن حذف مستأجر له تاريخ إشعارات إلا بتعطيل
   *   التريجر عمدًا — وهو ما نفعله هنا في التنظيف وحده، لا في كود
   *   التطبيق. راجع تقرير المهمة لأثر ذلك على طلبات محو البيانات.
   */
  async function wipeTenant() {
    await raw.$executeRawUnsafe(
      'ALTER TABLE "NotificationLog" DISABLE TRIGGER "NotificationLog_no_update"',
    );
    try {
      await raw.tenant.deleteMany({ where: { name: TENANT_NAME } });
    } finally {
      await raw.$executeRawUnsafe(
        'ALTER TABLE "NotificationLog" ENABLE TRIGGER "NotificationLog_no_update"',
      );
    }
  }

  /** ترخيص بفترة حالية تنتهي في تاريخ محدد */
  async function makeLicense(expiry: Date) {
    const license = await raw.license.create({
      data: { tenantId, licenseTypeId, facilityId, number: 'SCH-1', currentExpiry: expiry },
    });
    const period = await raw.licensePeriod.create({
      data: { tenantId, licenseId: license.id, expiryDate: expiry, isCurrent: true },
    });
    return { license, period };
  }

  // ═════════════════════════════════════════════════════════
  //  ١. يوم بعد يوم
  // ═════════════════════════════════════════════════════════

  describe('١) يوم بعد يوم', () => {
    it('كل مهلة تُطلق تنبيهًا واحدًا فقط، ولا يوم يُطلق تنبيهًا زائدًا', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);

      // نمرّ يومًا بيوم من ٦٥ يومًا قبل الانتهاء إلى ١٥ يومًا بعده
      for (let offset = 65; offset >= -15; offset--) {
        await scheduler.execute(addDays(expiry, -offset));
      }

      const jobs = await raw.reminderJob.findMany({
        where: { periodId: period.id },
        orderBy: { offsetDays: 'desc' },
      });

      const offsets = jobs.map((j) => j.offsetDays);

      // المهل المضبوطة + متابعة أسبوعية بعد الانتهاء (٧- و ١٤-)
      expect(offsets).toEqual([60, 30, 7, 0, -7, -14]);

      // ولا تكرار لأي مهلة
      expect(new Set(offsets).size).toBe(offsets.length);
    });

    it('لا يُنشئ شيئًا لترخيص ملغي أو مؤرشف', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { license, period } = await makeLicense(expiry);
      await raw.license.update({ where: { id: license.id }, data: { status: 'CANCELLED' } });

      await scheduler.execute(addDays(expiry, -60));

      expect(await raw.reminderJob.count({ where: { periodId: period.id } })).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════
  //  ٢. إعادة التشغيل — اختبار القيد الفريد
  // ═════════════════════════════════════════════════════════

  describe('٢) إعادة التشغيل بنفس التاريخ', () => {
    it('التشغيل الثاني بلا أثر: createdJobs = 0', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);
      const day = addDays(expiry, -60);

      const first = await scheduler.execute(day);
      expect(first.createdJobs).toBe(1);

      const second = await scheduler.execute(day);
      expect(second.createdJobs).toBe(0);

      const third = await scheduler.execute(day);
      expect(third.createdJobs).toBe(0);

      // وصف واحد فقط في القاعدة رغم ثلاث تشغيلات
      expect(await raw.reminderJob.count({ where: { periodId: period.id } })).toBe(1);
    });

    it('القيد الفريد (periodId, offsetDays) هو ما يمنع الازدواج', async () => {
      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);

      await raw.reminderJob.create({
        data: { tenantId, periodId: period.id, offsetDays: 30, dueOn: new Date() },
      });

      await expect(
        raw.reminderJob.create({
          data: { tenantId, periodId: period.id, offsetDays: 30, dueOn: new Date() },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  // ═════════════════════════════════════════════════════════
  //  ٣. التجديد أثناء الانتظار
  // ═════════════════════════════════════════════════════════

  describe('٣) التجديد بعد جدولة التنبيه وقبل إرساله', () => {
    it('التنبيه يُلغى ولا يُرسل — ولا يُكتب في سجل الإشعارات', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);
      const { registry, sent } = fakeSenders();

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { license, period } = await makeLicense(expiry);

      // التنبيه يُجدوَل
      await scheduler.execute(addDays(expiry, -30));
      const job = await raw.reminderJob.findFirstOrThrow({ where: { periodId: period.id } });
      expect(job.status).toBe('SCHEDULED');

      // ثم يُجدَّد الترخيص: الفترة القديمة تُغلق وتُنشأ جديدة
      const newExpiry = addDays(expiry, 365);
      await raw.licensePeriod.update({
        where: { id: period.id },
        data: { isCurrent: false, closedAt: new Date() },
      });
      await raw.licensePeriod.create({
        data: { tenantId, licenseId: license.id, expiryDate: newExpiry, isCurrent: true },
      });

      // الآن يعمل الطابور على تنبيه فترة لم تعد الحالية
      const processor = new ReminderProcessor(prisma, registry);
      await processor.process({ data: { reminderJobId: job.id } } as never);

      const after = await raw.reminderJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(after.status).toBe('CANCELLED');
      expect(sent).toHaveLength(0);
      expect(await raw.notificationLog.count({ where: { reminderId: job.id } })).toBe(0);
    });

    it('بلا تجديد: نفس التنبيه يُرسل ويُسجَّل', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);
      const { registry, sent } = fakeSenders();

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);

      await scheduler.execute(addDays(expiry, -30));
      const job = await raw.reminderJob.findFirstOrThrow({ where: { periodId: period.id } });

      const processor = new ReminderProcessor(prisma, registry);
      await processor.process({ data: { reminderJobId: job.id } } as never);

      expect((await raw.reminderJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('SENT');
      expect(sent).toHaveLength(1);

      // القاعدة الثابتة رقم ٢: السجل يُكتب مرة ولا يُعدَّل بعدها
      const logs = await raw.notificationLog.findMany({ where: { reminderId: job.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('SENT');
      expect(logs[0].bodySnapshot.length).toBeGreaterThan(0);
    });
  });

  // ═════════════════════════════════════════════════════════
  //  ٤. يوم مفقود
  // ═════════════════════════════════════════════════════════

  describe('٤) الخدمة متوقفة يومين ثم تعود', () => {
    it('المهام الفائتة تُدفع إلى الطابور ولا تضيع', async () => {
      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);

      // اليوم الأول: يعمل المجدول وينشئ تنبيه ٦٠ يومًا
      const q1 = fakeQueue();
      const day1 = addDays(expiry, -60);
      await new ReminderSchedulerService(prisma, q1.queue).execute(day1);

      const job = await raw.reminderJob.findFirstOrThrow({ where: { periodId: period.id } });
      expect(job.offsetDays).toBe(60);
      expect(q1.added).toHaveLength(1);

      // نُعيده إلى SCHEDULED لنحاكي أن الطابور لم يعالجه قبل التوقف
      await raw.reminderJob.update({ where: { id: job.id }, data: { status: 'SCHEDULED' } });

      // يومان بلا تشغيل… ثم يعود المجدول
      const q2 = fakeQueue();
      const day3 = addDays(expiry, -57);
      const result = await new ReminderSchedulerService(prisma, q2.queue).execute(day3);

      // لا مهمة جديدة (لا مهلة تقابل ٥٧ يومًا) لكن الفائتة أُعيد دفعها
      expect(result.createdJobs).toBe(0);
      expect(q2.added).toHaveLength(1);
      expect(q2.added[0].data.reminderJobId).toBe(job.id);
      expect(q2.added[0].opts.jobId).toBe(job.id); // منع الازدواج على مستوى الطابور
    });

    it('يوم مفقود تمامًا: مهلة لم يعمل المجدول في يومها لا تُنشأ لاحقًا', async () => {
      // هذا حدّ معروف في التصميم: المجدول يبحث عن expiryDate == today+offset
      // بالضبط. تخطّي اليوم يعني تخطّي تلك المهلة، والمهلة التالية تلتقطه.
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { period } = await makeLicense(expiry);

      await scheduler.execute(addDays(expiry, -59)); // تخطّينا يوم الـ٦٠
      expect(await raw.reminderJob.count({ where: { periodId: period.id } })).toBe(0);

      await scheduler.execute(addDays(expiry, -30)); // المهلة التالية تعمل
      const jobs = await raw.reminderJob.findMany({ where: { periodId: period.id } });
      expect(jobs.map((j) => j.offsetDays)).toEqual([30]);
    });
  });

  // ═════════════════════════════════════════════════════════
  //  إعادة حساب الحالة
  // ═════════════════════════════════════════════════════════

  describe('إعادة حساب حالة الترخيص', () => {
    it('تنتقل ACTIVE ← EXPIRING_SOON ← EXPIRED مع مرور الأيام', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { license } = await makeLicense(expiry);

      await scheduler.execute(addDays(expiry, -90));
      expect((await raw.license.findUniqueOrThrow({ where: { id: license.id } })).status).toBe('ACTIVE');

      await scheduler.execute(addDays(expiry, -45));
      expect((await raw.license.findUniqueOrThrow({ where: { id: license.id } })).status).toBe(
        'EXPIRING_SOON',
      );

      await scheduler.execute(addDays(expiry, 1));
      expect((await raw.license.findUniqueOrThrow({ where: { id: license.id } })).status).toBe(
        'EXPIRED',
      );
    });

    it('لا يلمس UNDER_RENEWAL ولا CANCELLED — يضبطهما المستخدم', async () => {
      const { queue } = fakeQueue();
      const scheduler = new ReminderSchedulerService(prisma, queue);

      const expiry = riyadhToday(new Date('2027-06-01T00:00:00.000Z'));
      const { license } = await makeLicense(expiry);
      await raw.license.update({ where: { id: license.id }, data: { status: 'UNDER_RENEWAL' } });

      await scheduler.execute(addDays(expiry, 30)); // منتهٍ فعلًا

      expect((await raw.license.findUniqueOrThrow({ where: { id: license.id } })).status).toBe(
        'UNDER_RENEWAL',
      );
    });
  });
});
