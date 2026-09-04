// ══════════════════════════════════════════════════════════════
//  apps/api/test/verify-tenant-isolation.ts
//
//  إثبات تنفيذي لشرط المهمة ٣ غير القابل للتفاوض: عزل المستأجرين
//  يحدث في طبقة Prisma نفسها، لا في ذاكرة من يكتب الاستعلام.
//
//  كل حالة هنا تكتب استعلامًا «ساذجًا» بلا أي ذكر لـ tenantId —
//  كما سيكتبه مطوّر نسي القاعدة — ثم تتحقق أن الحدود صمدت رغمه.
//
//  التشغيل:  npm run verify:isolation --workspace=apps/api
//  (يتحول إلى ملف jest في المهمة ٦)
// ══════════════════════════════════════════════════════════════

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} ${detail}`);
  }
}

/**
 * `needle` يُطابَق على رسالة الخطأ أو على رمز Prisma.
 * (رموز مثل P2025 تأتي في err.code لا داخل النص، والنص إنجليزي من Prisma.)
 */
async function expectRejection(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn();
    check(label, false, '→ نجح وكان يجب أن يُرفض');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code ?? '';
    check(label, message.includes(needle) || code === needle, `→ رُفض برسالة غير متوقعة: ${message}`);
  }
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const prisma = app.get(PrismaService);
  const ctx = app.get(TenantContextService);
  const auth = app.get(AuthService);

  /**
   * يحاكي طلب HTTP مُصادَقًا عليه: نفس ما يفعله الوسيط ثم الحارس.
   *
   * ★ لاحظ `await fn()` لا `return fn()`.
   *   استعلام Prisma كسول (PrismaPromise): بناؤه لا ينفّذه، والامتداد
   *   لا يعمل إلا عند انتظاره. فلو أُنشئ داخل السياق وانتُظر خارجه،
   *   وجد الامتداد نفسه بلا سياق وعامل الاستعلام معاملة النظام.
   *   الانتظار داخل النطاق هو ما يفعله NestJS تلقائيًا في المسارات
   *   الحقيقية — والقسم العاشر أدناه يثبت ذلك عبر HTTP فعلي.
   */
  const asTenant = <T>(tenantId: string, userId: string, fn: () => Promise<T>): Promise<T> =>
    ctx.runForRequest(async () => {
      ctx.authenticate({ tenantId, userId, role: 'OWNER', isSuperAdmin: false });
      return await fn();
    });

  /** يحاكي طلبًا وصل قبل المصادقة */
  const unauthenticated = <T>(fn: () => Promise<T>): Promise<T> =>
    ctx.runForRequest(async () => await fn());

  const stamp = Date.now();
  const emailA = `owner-a-${stamp}@example.sa`;
  const emailB = `owner-b-${stamp}@example.sa`;

  /** تنظيف شامل — يسبق التشغيل ويليه، فبقايا تشغيل متعثّر لا تُفسد النتائج */
  const wipe = async () => {
    await prisma.licenseType.deleteMany({ where: { code: { startsWith: 'PRIVATE_A_' } } });
    await prisma.tenant.deleteMany({ where: { name: { in: ['محامص أ', 'عطارة ب'] } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@example.sa' } } });
  };

  await wipe();

  const before = await prisma.licenseType.count();
  check('الكتالوج نظيف قبل البدء (٢٧ نوعًا عامًا)', before === 27, `→ ${before}`);

  try {
    // ═══ التهيئة: منشأتان مستقلتان ═══
    console.log('\n── التهيئة ──');

    const a = await auth.register({
      fullName: 'مالك أ',
      email: emailA,
      password: 'كلمة-مرور-طويلة-جدا',
      tenantName: 'محامص أ',
      phone: null,
      crNumber: null,
    });
    const b = await auth.register({
      fullName: 'مالك ب',
      email: emailB,
      password: 'كلمة-مرور-طويلة-جدا',
      tenantName: 'عطارة ب',
      phone: null,
      crNumber: null,
    });

    const A = a.user.tenantId;
    const B = b.user.tenantId;
    check('التسجيل أنشأ منشأتين مختلفتين', A !== B);
    check('المسجِّل صار مالكًا', a.user.role === 'OWNER');
    check('صدرت رموز وصول وتحديث', !!a.accessToken && !!a.refreshToken);

    // قواعد التنبيه الافتراضية
    const rulesA = await asTenant(A, a.user.userId, () => prisma.reminderRule.count());
    check('أُنشئت قواعد تنبيه افتراضية (٤ مهل × قناتان)', rulesA === 8, `→ ${rulesA}`);

    // بيانات لكل منشأة — لاحظ: لا tenantId في أي create أدناه
    await asTenant(A, a.user.userId, async () => {
      await prisma.facility.create({ data: { name: 'فرع أ الرئيسي' } as never });
      await prisma.person.create({ data: { fullName: 'موظف أ' } as never });
    });
    await asTenant(B, b.user.userId, async () => {
      await prisma.facility.create({ data: { name: 'فرع ب الرئيسي' } as never });
    });

    // ═══ ١) القراءة ═══
    console.log('\n── ١) القراءة: findMany بلا أي شرط ──');

    const seenByA = await asTenant(A, a.user.userId, () => prisma.facility.findMany());
    const seenByB = await asTenant(B, b.user.userId, () => prisma.facility.findMany());

    check('أ ترى فرعها فقط', seenByA.length === 1 && seenByA[0].name === 'فرع أ الرئيسي');
    check('ب ترى فرعها فقط', seenByB.length === 1 && seenByB[0].name === 'فرع ب الرئيسي');
    check('tenantId حُقن في الإنشاء تلقائيًا', seenByA[0].tenantId === A);

    const countA = await asTenant(A, a.user.userId, () => prisma.facility.count());
    check('count محصور أيضًا', countA === 1, `→ ${countA}`);

    // ═══ ٢) القراءة بالمعرّف المباشر ═══
    console.log('\n── ٢) findUnique بمعرّف منشأة أخرى ──');

    const bFacilityId = seenByB[0].id;
    const stolen = await asTenant(A, a.user.userId, () =>
      prisma.facility.findUnique({ where: { id: bFacilityId } }),
    );
    check('أ لا تصل إلى سجل ب بمعرّفه', stolen === null);

    // ═══ ٣) الكتابة عبر الحدود ═══
    console.log('\n── ٣) الكتابة على سجل منشأة أخرى ──');

    await expectRejection(
      'update على سجل ب من أ يُرفض',
      () =>
        asTenant(A, a.user.userId, () =>
          prisma.facility.update({ where: { id: bFacilityId }, data: { city: 'مسروق' } }),
        ),
      'P2025',
    );

    await expectRejection(
      'delete على سجل ب من أ يُرفض',
      () =>
        asTenant(A, a.user.userId, () =>
          prisma.facility.delete({ where: { id: bFacilityId } }),
        ),
      'P2025',
    );

    const bStillThere = await asTenant(B, b.user.userId, () => prisma.facility.count());
    check('سجل ب سليم بعد المحاولتين', bStillThere === 1);

    // updateMany/deleteMany الجماعية — أخطر الحالات لأنها بلا معرّف
    const wiped = await asTenant(A, a.user.userId, () =>
      prisma.facility.deleteMany({}), // «احذف كل شيء» — بلا شرط إطلاقًا
    );
    check('deleteMany({}) لم يمسّ إلا صفوف أ', wiped.count === 1, `→ ${wiped.count}`);

    const bSurvived = await asTenant(B, b.user.userId, () => prisma.facility.count());
    check('ب ما زالت سليمة بعد deleteMany من أ', bSurvived === 1);

    // ═══ ٤) شرط OR الخاص بالمستدعي لا يكسر الحصر ═══
    console.log('\n── ٤) شرط OR من المستدعي (كما في licenses-bulk) ──');

    const withOr = await asTenant(A, a.user.userId, () =>
      prisma.person.findMany({
        where: { OR: [{ fullName: 'موظف أ' }, { fullName: 'موظف ب' }] },
      }),
    );
    check('AND[شرط المستدعي، الحصر] لم يتوسّع', withOr.length === 1);

    // ═══ ٥) الكتالوج المشترك ═══
    console.log('\n── ٥) LicenseType: عام + خاص ──');

    const catalogA = await asTenant(A, a.user.userId, () => prisma.licenseType.count());
    check('أ ترى الكتالوج العام (٢٧ نوعًا)', catalogA === 27, `→ ${catalogA}`);

    await asTenant(A, a.user.userId, () =>
      prisma.licenseType.create({
        data: { nameAr: 'نوع خاص بـ أ', code: `PRIVATE_A_${stamp}`, holderType: 'FACILITY' } as never,
      }),
    );

    const afterA = await asTenant(A, a.user.userId, () => prisma.licenseType.count());
    const afterB = await asTenant(B, b.user.userId, () => prisma.licenseType.count());
    check('أ ترى العام + نوعها الخاص', afterA === 28, `→ ${afterA}`);
    check('ب لا ترى نوع أ الخاص', afterB === 27, `→ ${afterB}`);

    // لا يعدّل أحد الكتالوج العام
    const globalType = await asTenant(A, a.user.userId, () =>
      prisma.licenseType.findFirst({ where: { code: 'CR' } }),
    );
    await expectRejection(
      'تعديل نوع عام من داخل مستأجر يُرفض',
      () =>
        asTenant(A, a.user.userId, () =>
          prisma.licenseType.update({
            where: { id: globalType!.id },
            data: { nameAr: 'اسم مُخترَق' },
          }),
        ),
      'P2025',
    );

    // ═══ ٦) الإغلاق عند غياب الهوية ═══
    console.log('\n── ٦) طلب بلا مصادقة ──');

    await expectRejection(
      'استعلام على جدول مملوك بلا سياق مستأجر يُرفض',
      () => unauthenticated(() => prisma.facility.findMany()),
      'بلا سياق مستأجر',
    );

    const users = await unauthenticated(() => prisma.user.count());
    check('جدول User غير محصور (الدخول يحتاجه)', users >= 2);

    // ═══ ٧) سياق النظام ═══
    console.log('\n── ٧) سياق النظام (المجدول والمعالج) ──');

    const allFacilities = await prisma.facility.findMany(); // خارج أي طلب
    check('المجدول يرى كل المستأجرين', allFacilities.length >= 1);

    // ═══ ٨) تدوير رمز التحديث ═══
    console.log('\n── ٨) تدوير رمز التحديث ──');

    const rotated = await auth.refresh(a.refreshToken);
    check('التدوير أصدر رمزًا جديدًا', rotated.refreshToken !== a.refreshToken);

    await expectRejection(
      'إعادة استعمال الرمز القديم تُرفض',
      () => auth.refresh(a.refreshToken),
      'انتهت الجلسة',
    );

    await expectRejection(
      'وإعادة الاستعمال أبطلت الجلسة الجديدة أيضًا',
      () => auth.refresh(rotated.refreshToken),
      'انتهت الجلسة',
    );

    // ═══ ٩) الدعوات ═══
    console.log('\n── ٩) الدعوات والأدوار ──');

    const invite = await auth.invite(
      { userId: a.user.userId, fullName: 'مالك أ', tenantId: A },
      { email: `viewer-${stamp}@example.sa`, role: 'VIEWER' },
    );
    check('أُنشئت دعوة برمز', !!invite.token);

    const accepted = await auth.acceptInvite({
      token: invite.token,
      fullName: 'مطّلع جديد',
      password: 'كلمة-مرور-طويلة-جدا',
    });
    check('المدعوّ انضم بدور VIEWER', accepted.user.role === 'VIEWER');
    check('وانضم إلى منشأة أ تحديدًا', accepted.user.tenantId === A);

    await expectRejection(
      'الدعوة تُستهلك مرة واحدة',
      () => auth.acceptInvite({ token: invite.token, fullName: null, password: null }),
      'غير صالحة',
    );

    await expectRejection(
      'لا يمكن إخراج المالك الوحيد',
      () => asTenant(A, a.user.userId, () => auth.removeMember(A, a.user.userId, 'someone-else')),
      'بلا مالك',
    );

    // ═══ ١٠) عبر HTTP حقيقي — السلسلة كاملة ═══
    // الأقسام السابقة تحاكي الطلب داخل العملية. هذا القسم يشغّل خادمًا
    // فعليًا ويطلب عليه بـ fetch، فيثبت أن الوسيط والحارس والامتداد
    // تعمل معًا كما ستعمل في الإنتاج.
    console.log('\n── ١٠) عبر HTTP حقيقي ──');

    const http = await NestFactory.create(AppModule, { logger: false });
    http.setGlobalPrefix('api');
    await http.listen(0);
    const base = (await http.getUrl()).replace('[::1]', '127.0.0.1');

    const call = async (path: string, token?: string, init: RequestInit = {}) => {
      const res = await fetch(`${base}/api${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // ردود الاختبار تُفحص بالتأكيدات لا بالأنواع، و res.json() يعطي unknown
      return { status: res.status, body: (await res.json().catch(() => null)) as any };
    };

    try {
      const noAuth = await call('/auth/members');
      check('طلب بلا رمز يُرفض 401', noAuth.status === 401, `→ ${noAuth.status}`);

      const loginA = await call('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: emailA, password: 'كلمة-مرور-طويلة-جدا' }),
      });
      const loginB = await call('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: emailB, password: 'كلمة-مرور-طويلة-جدا' }),
      });
      check('الدخول عبر HTTP نجح للمنشأتين', loginA.status === 200 && loginB.status === 200);

      const tokenA = loginA.body.accessToken;
      const tokenB = loginB.body.accessToken;

      const membersA = await call('/auth/members', tokenA);
      const membersB = await call('/auth/members', tokenB);

      // أ فيها المالك + المطّلع المدعوّ، ب فيها المالك وحده
      check('أ ترى أعضاءها فقط عبر HTTP', membersA.body?.length === 2, `→ ${membersA.body?.length}`);
      check('ب ترى عضوها الوحيد عبر HTTP', membersB.body?.length === 1, `→ ${membersB.body?.length}`);

      const emailsA = (membersA.body ?? []).map((m: any) => m.user.email);
      check('لا تسرّب بين المنشأتين', !emailsA.includes(emailB));

      const badPassword = await call('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: emailA, password: 'كلمة-مرور-خاطئة-تمامًا' }),
      });
      check('كلمة مرور خاطئة تُرفض 401', badPassword.status === 401, `→ ${badPassword.status}`);

      const shortPassword = await call('/auth/register', undefined, {
        method: 'POST',
        body: JSON.stringify({
          fullName: 'اختبار', email: `short-${stamp}@example.sa`,
          password: '123', tenantName: 'منشأة',
        }),
      });
      check('كلمة مرور قصيرة تُرفض 422 من Zod', shortPassword.status === 422, `→ ${shortPassword.status}`);

      // VIEWER لا يدعو أعضاء — RolesGuard
      const loginViewer = await call('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: `viewer-${stamp}@example.sa`, password: 'كلمة-مرور-طويلة-جدا' }),
      });
      const viewerInvite = await call('/auth/invitations', loginViewer.body.accessToken, {
        method: 'POST',
        body: JSON.stringify({ email: 'x@example.sa', role: 'VIEWER' }),
      });
      check('VIEWER لا يستطيع دعوة أعضاء (403)', viewerInvite.status === 403, `→ ${viewerInvite.status}`);

      const ownerInvite = await call('/auth/invitations', tokenA, {
        method: 'POST',
        body: JSON.stringify({ email: `another-${stamp}@example.sa`, role: 'MANAGER' }),
      });
      check('OWNER يستطيع الدعوة', ownerInvite.status === 201, `→ ${ownerInvite.status}`);
    } finally {
      await http.close();
    }
  } finally {
    await wipe();
    await app.close();
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`نجح: ${passed}   فشل: ${failed}`);
  console.log('═'.repeat(50));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💥 توقّف التحقق:', err);
  process.exit(1);
});
