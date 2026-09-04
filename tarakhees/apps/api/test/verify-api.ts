// ══════════════════════════════════════════════════════════════
//  apps/api/test/verify-api.ts
//
//  تحقق من مسارات المهمة ٤ عبر HTTP فعلي — كل ما في القائمة،
//  مع تركيز على القاعدة الحرجة: لا يُعدَّل سجل فترة قديم أبدًا.
//
//  التشغيل:  npm run verify:api --workspace=apps/api
// ══════════════════════════════════════════════════════════════

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} ${detail}`);
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

async function main() {
  // يُقرأ في مُنشئ SuperAdminService، فيجب ضبطه قبل بناء التطبيق
  const superAdminEmail = `api-a-${Date.now()}@example.sa`;
  process.env.SUPER_ADMIN_EMAILS = superAdminEmail;

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0);

  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  const prisma = app.get(PrismaService);

  const stamp = Number(superAdminEmail.match(/\d+/)![0]);
  const emailA = superAdminEmail;
  const emailB = `api-b-${stamp}@example.sa`;

  const call = async (path: string, token?: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const post = (p: string, t: string | undefined, b: unknown) =>
    call(p, t, { method: 'POST', body: JSON.stringify(b) });
  const patch = (p: string, t: string, b: unknown) =>
    call(p, t, { method: 'PATCH', body: JSON.stringify(b) });

  const wipe = async () => {
    await prisma.licenseType.deleteMany({ where: { code: { startsWith: 'APITEST_' } } });
    await prisma.tenant.deleteMany({ where: { name: { in: ['منشأة API أ', 'منشأة API ب'] } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@example.sa' } } });
  };

  await wipe();

  try {
    // ═══ تهيئة ═══
    console.log('\n── التهيئة ──');
    const regA = await post('/auth/register', undefined, {
      fullName: 'مالك أ', email: emailA, password: 'كلمة-مرور-طويلة-جدا',
      tenantName: 'منشأة API أ',
    });
    const regB = await post('/auth/register', undefined, {
      fullName: 'مالك ب', email: emailB, password: 'كلمة-مرور-طويلة-جدا',
      tenantName: 'منشأة API ب',
    });
    check('تسجيل منشأتين', regA.status === 201 && regB.status === 201);
    const tA = regA.body.accessToken;
    const tB = regB.body.accessToken;

    // ═══ الكتالوج ═══
    console.log('\n── GET /license-types ──');
    const types = await call('/license-types', tA);
    check('الكتالوج العام ٢٧ نوعًا', types.body?.length === 27, `→ ${types.body?.length}`);
    check('الأنواع العامة مُعلَّمة isGlobal', types.body?.every((t: any) => t.isGlobal === true));

    const facilityType = types.body.find((t: any) => t.code === 'MUNICIPAL');
    const personType = types.body.find((t: any) => t.holderType === 'PERSON');

    const ownType = await post('/license-types', tA, {
      nameAr: 'نوع خاص للاختبار', code: `APITEST_${stamp}`, holderType: 'FACILITY',
    });
    check('إنشاء نوع خاص بالمستأجر', ownType.status === 201);

    const typesB = await call('/license-types', tB);
    check('ب لا ترى نوع أ الخاص', typesB.body?.length === 27, `→ ${typesB.body?.length}`);

    const globalEdit = await patch(`/license-types/${facilityType.id}`, tA, { nameAr: 'مُخترَق' });
    check('تعديل نوع من الكتالوج العام مرفوض', globalEdit.status === 404, `→ ${globalEdit.status}`);

    // ═══ الفروع والأشخاص ═══
    console.log('\n── CRUD /facilities و /persons ──');
    const fac = await post('/facilities', tA, { name: 'فرع الملز', city: 'الرياض' });
    check('إنشاء فرع', fac.status === 201 && fac.body.name === 'فرع الملز');

    const facList = await call('/facilities', tA);
    check('قائمة الفروع تعرض فرعًا واحدًا', facList.body?.length === 1);
    check('ب لا ترى فرع أ', (await call('/facilities', tB)).body?.length === 0);

    const person = await post('/persons', tA, {
      fullName: 'أحمد العتيبي', nationalId: '1012345678', jobTitle: 'محاسب',
    });
    check('إنشاء شخص برقم هوية', person.status === 201);

    // ★ القاعدة الثابتة رقم ٤
    const rawPerson = await prisma.person.findFirst({ where: { fullName: 'أحمد العتيبي' } });
    check(
      'رقم الهوية مشفَّر في قاعدة البيانات',
      !!rawPerson?.nationalId && !rawPerson.nationalId.includes('1012345678'),
      `→ ${rawPerson?.nationalId?.slice(0, 20)}`,
    );
    check('الصيغة المخزَّنة v1:iv:tag:data', rawPerson?.nationalId?.startsWith('v1:') === true);

    const personList = await call('/persons', tA);
    check('القوائم تُقنّع الرقم', personList.body?.[0]?.nationalId?.endsWith('5678') &&
      !personList.body?.[0]?.nationalId?.includes('1012'), `→ ${personList.body?.[0]?.nationalId}`);

    const personDetail = await call(`/persons/${person.body.id}`, tA);
    check('OWNER يرى الرقم كاملًا في التفاصيل',
      personDetail.body?.nationalId === '1012345678', `→ ${personDetail.body?.nationalId}`);

    const badId = await post('/persons', tA, { fullName: 'خطأ', nationalId: '9999' });
    check('رقم هوية غير صالح مرفوض 422', badId.status === 422, `→ ${badId.status}`);

    // ═══ التراخيص ═══
    console.log('\n── POST /licenses و GET /licenses ──');
    const lic = await post('/licenses', tA, {
      licenseTypeId: facilityType.id,
      facilityId: fac.body.id,
      number: 'ML-1001',
      expiryDate: daysFromNow(45),
      cost: 1500,
    });
    check('إنشاء ترخيص', lic.status === 201, `→ ${lic.status} ${JSON.stringify(lic.body)}`);

    const bothHolders = await post('/licenses', tA, {
      licenseTypeId: facilityType.id,
      facilityId: fac.body.id,
      personId: person.body.id,
      expiryDate: daysFromNow(30),
    });
    check('ترخيص بحاملين مرفوض 422', bothHolders.status === 422, `→ ${bothHolders.status}`);

    const wrongHolder = await post('/licenses', tA, {
      licenseTypeId: personType.id,
      facilityId: fac.body.id,
      expiryDate: daysFromNow(30),
    });
    check('نوع للأشخاص مع فرع مرفوض 400', wrongHolder.status === 400, `→ ${wrongHolder.status}`);

    // ★ القاعدة الثابتة رقم ١
    const storedPeriod = await prisma.licensePeriod.findFirst({
      where: { licenseId: lic.body.id },
    });
    check('تاريخ الانتهاء منتصف ليل UTC',
      storedPeriod?.expiryDate.toISOString().endsWith('T00:00:00.000Z') === true,
      `→ ${storedPeriod?.expiryDate.toISOString()}`);
    check('الهجري محسوب تلقائيًا',
      /^\d{4}-\d{2}-\d{2}$/.test(storedPeriod?.expiryHijri ?? ''),
      `→ ${storedPeriod?.expiryHijri}`);
    check('الحالة EXPIRING_SOON لانتهاء بعد ٤٥ يومًا',
      (await call(`/licenses/${lic.body.id}`, tA)).body?.status === 'EXPIRING_SOON');

    console.log('\n── الفلاتر والبحث ──');
    const listed = await call('/licenses', tA);
    check('القائمة تُعيد الترخيص', listed.body?.total === 1, `→ ${listed.body?.total}`);
    check('daysLeft محسوب', listed.body?.items?.[0]?.daysLeft === 45,
      `→ ${listed.body?.items?.[0]?.daysLeft}`);
    check('فلتر الحالة يعمل',
      (await call('/licenses?status=EXPIRED', tA)).body?.total === 0);
    check('فلتر الفرع يعمل',
      (await call(`/licenses?facilityId=${fac.body.id}`, tA)).body?.total === 1);
    check('البحث بالرقم يعمل',
      (await call('/licenses?q=ML-1001', tA)).body?.total === 1);
    check('البحث بما لا يطابق يعيد صفرًا',
      (await call('/licenses?q=لا-يوجد', tA)).body?.total === 0);
    check('expiringWithinDays=30 لا يشمل ترخيص ٤٥ يومًا',
      (await call('/licenses?expiringWithinDays=30', tA)).body?.total === 0);
    check('ب لا ترى تراخيص أ', (await call('/licenses', tB)).body?.total === 0);

    // ═══ ★ التجديد — القاعدة الحرجة ═══
    console.log('\n── POST /licenses/:id/renew ──');

    const before = await prisma.licensePeriod.findFirstOrThrow({
      where: { licenseId: lic.body.id, isCurrent: true },
    });

    const backwards = await post(`/licenses/${lic.body.id}/renew`, tA, {
      expiryDate: daysFromNow(10),
    });
    check('تجديد بتاريخ أقدم مرفوض', backwards.status === 400, `→ ${backwards.status}`);

    const renewed = await post(`/licenses/${lic.body.id}/renew`, tA, {
      expiryDate: daysFromNow(410),
      issueDate: daysFromNow(45),
      cost: 1800,
    });
    check('التجديد نجح', renewed.status === 200, `→ ${renewed.status}`);

    const after = await prisma.licensePeriod.findUniqueOrThrow({ where: { id: before.id } });

    // هذه أهم أربع فحوص في المهمة كلها
    check('★ الفترة القديمة: تاريخ الانتهاء لم يتغيّر',
      after.expiryDate.getTime() === before.expiryDate.getTime());
    check('★ الفترة القديمة: التكلفة لم تتغيّر',
      String(after.cost) === String(before.cost));
    check('★ الفترة القديمة: صارت غير حالية', after.isCurrent === false);
    check('★ الفترة القديمة: خُتمت بـ closedAt', after.closedAt !== null);

    const periods = await prisma.licensePeriod.findMany({
      where: { licenseId: lic.body.id }, orderBy: { expiryDate: 'asc' },
    });
    check('صار للترخيص فترتان', periods.length === 2, `→ ${periods.length}`);
    check('فترة حالية واحدة فقط',
      periods.filter((p) => p.isCurrent).length === 1);

    const detail = await call(`/licenses/${lic.body.id}`, tA);
    check('صفحة الترخيص تعرض سجل الفترات', detail.body?.periods?.length === 2);
    check('وتعرض سجل التنبيهات', Array.isArray(detail.body?.reminders));
    check('الحالة عادت ACTIVE بعد التجديد', detail.body?.status === 'ACTIVE',
      `→ ${detail.body?.status}`);

    // ═══ التعديل ═══
    console.log('\n── PATCH /licenses/:id ──');
    const patched = await patch(`/licenses/${lic.body.id}`, tA, { label: 'رخصة الملز' });
    check('تعديل البيانات الأساسية', patched.status === 200);
    check('التعديل لم يمسّ الفترات',
      (await prisma.licensePeriod.count({ where: { licenseId: lic.body.id } })) === 2);

    const crossTenant = await patch(`/licenses/${lic.body.id}`, tB, { label: 'مسروق' });
    check('ب لا تستطيع تعديل ترخيص أ', crossTenant.status === 404, `→ ${crossTenant.status}`);

    // ═══ لوحة القيادة ═══
    console.log('\n── GET /dashboard/summary ──');
    const dash = await call('/dashboard/summary', tA);
    check('اللوحة تستجيب', dash.status === 200);
    check('أعداد كل حالة موجودة',
      typeof dash.body?.counts?.ACTIVE === 'number' &&
      typeof dash.body?.counts?.EXPIRED === 'number');
    check('within30 و within60 موجودان',
      typeof dash.body?.within30 === 'number' && typeof dash.body?.within60 === 'number');
    check('جدول «يحتاج انتباهك» موجود', Array.isArray(dash.body?.attention));
    check('الشريط الزمني ٩٠ يومًا موجود', Array.isArray(dash.body?.timeline));
    check('عدّاد الإشعارات الفاشلة موجود',
      typeof dash.body?.failedReminders === 'number');
    check('لوحة ب فارغة', (await call('/dashboard/summary', tB)).body?.counts?.ACTIVE === 0);

    // ═══ الصلاحيات ═══
    console.log('\n── الصلاحيات ──');
    const inv = await post('/auth/invitations', tA, {
      email: `viewer-api-${stamp}@example.sa`, role: 'VIEWER',
    });
    await post('/auth/accept-invite', undefined, {
      token: inv.body.token, fullName: 'مطّلع', password: 'كلمة-مرور-طويلة-جدا',
    });
    const viewer = await post('/auth/login', undefined, {
      email: `viewer-api-${stamp}@example.sa`, password: 'كلمة-مرور-طويلة-جدا',
    });
    const vt = viewer.body.accessToken;

    check('VIEWER يقرأ القائمة', (await call('/licenses', vt)).status === 200);
    check('VIEWER لا ينشئ ترخيصًا (403)',
      (await post('/licenses', vt, {
        licenseTypeId: facilityType.id, facilityId: fac.body.id, expiryDate: daysFromNow(90),
      })).status === 403);
    check('VIEWER لا يجدّد (403)',
      (await post(`/licenses/${lic.body.id}/renew`, vt, { expiryDate: daysFromNow(800) })).status === 403);
    check('VIEWER لا يرى رقم الهوية كاملًا',
      (await call(`/persons/${person.body.id}`, vt)).body?.nationalId?.includes('•') === true);

    // ═══ مسار المشرف ═══
    console.log('\n── POST /admin/reminders/run ──');
    const adminDenied = await post('/admin/reminders/run', tB, {});
    check('غير المشرف يُرفض 403', adminDenied.status === 403, `→ ${adminDenied.status}`);

    // أ مشرف منصة (SUPER_ADMIN_EMAILS)، فيمرّ ويشغّل المجدول فعليًا
    const adminRun = await post('/admin/reminders/run', tA, {});
    check('المشرف يشغّل المجدول (200)', adminRun.status === 200, `→ ${adminRun.status}`);
    check('المجدول أعاد إحصاءه',
      typeof adminRun.body?.statusCounts === 'number' &&
      typeof adminRun.body?.createdJobs === 'number' &&
      typeof adminRun.body?.enqueued === 'number',
      `→ ${JSON.stringify(adminRun.body)}`);

    const badDate = await post('/admin/reminders/run?date=ليس-تاريخًا', tA, {});
    check('تاريخ غير صالح مرفوض 400', badDate.status === 400, `→ ${badDate.status}`);

    // ═══ الإعدادات ═══
    console.log('\n── GET /settings/reminder-rules ──');
    const rules = await call('/settings/reminder-rules', tA);
    check('قواعد التنبيه الافتراضية ٨', rules.body?.length === 8, `→ ${rules.body?.length}`);
    const savedRule = await post('/settings/reminder-rules', tA, {
      offsetDays: 14, channel: 'EMAIL', isActive: true,
    });
    check('إضافة مهلة جديدة', savedRule.status === 201);
    check('صارت ٩ قواعد', (await call('/settings/reminder-rules', tA)).body?.length === 9);

    // ═══ الاستيراد الجماعي (الملف الجاهز) ═══
    console.log('\n── POST /licenses/bulk (الملف الجاهز) ──');
    const bulkOk = await post('/licenses/bulk', tA, {
      licenses: [
        { licenseTypeId: facilityType.id, holderId: fac.body.id, number: 'B-1', expiryDate: daysFromNow(120) },
        { licenseTypeId: facilityType.id, holderId: fac.body.id, number: 'B-2', expiryDate: daysFromNow(150) },
      ],
    });
    check('استيراد صفّين نجح', bulkOk.status === 201 && bulkOk.body?.created === 2,
      `→ ${bulkOk.status} ${JSON.stringify(bulkOk.body)}`);

    const countBefore = await prisma.license.count();
    // ★ القاعدة الثابتة رقم ٥: لا نجاح جزئي
    const bulkBad = await post('/licenses/bulk', tA, {
      licenses: [
        { licenseTypeId: facilityType.id, holderId: fac.body.id, number: 'B-3', expiryDate: daysFromNow(200) },
        { licenseTypeId: 'نوع-غير-موجود', holderId: fac.body.id, number: 'B-4', expiryDate: daysFromNow(220) },
      ],
    });
    check('دفعة فيها صف خاطئ تُرفض 422', bulkBad.status === 422, `→ ${bulkBad.status}`);
    check('★ ولم يُحفظ منها شيء (لا نجاح جزئي)',
      (await prisma.license.count()) === countBefore);
  } finally {
    await wipe();
    await app.close();
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`نجح: ${passed}   فشل: ${failed}`);
  console.log('═'.repeat(50));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\n💥 توقّف التحقق:', e);
  process.exit(1);
});
