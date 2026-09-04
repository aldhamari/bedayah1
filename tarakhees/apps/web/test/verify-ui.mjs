// ══════════════════════════════════════════════════════════════
//  apps/web/test/verify-ui.mjs
//
//  تحقق من شاشات المهمة ٥ في متصفح حقيقي: تسجيل، إنشاء بيانات،
//  تجديد، فلاتر، لصق في الإدخال السريع، ثم خروج وحماية المسارات.
//
//  يتطلب تشغيل الخادمين:
//      npm run dev:api      (المنفذ 4000)
//      npm run dev:web      (المنفذ 3000)
//  ثم:  npm run verify:ui --workspace=apps/web
//
//  يترك لقطات في .ui-shots للمراجعة البصرية.
// ══════════════════════════════════════════════════════════════

import { chromium } from 'playwright';

// اللقطات والمنفذ قابلان للضبط، والمتصفح يُؤخذ من PLAYWRIGHT_CHROMIUM
// إن ضُبط، وإلا استُعمل ما نزّلته playwright بنفسها.
const SHOTS = process.env.UI_SHOTS ?? './.ui-shots';
const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:3000';
const stamp = Date.now();
const email = `ui-${stamp}@example.sa`;
const PW = 'كلمة-مرور-طويلة-جدا';

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${detail}`); }
};

// المتصفح المثبَّت مسبقًا في البيئة — لا تنزيل
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
const missing = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && missing.push(`${r.status()} ${r.url()}`));

try {
  // ═══ التسجيل ═══
  console.log('\n── التسجيل ──');
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });

  const dir = await page.getAttribute('html', 'dir');
  const lang = await page.getAttribute('html', 'lang');
  check('الجذر dir="rtl" و lang="ar"', dir === 'rtl' && lang === 'ar', `→ ${dir}/${lang}`);

  await page.fill('input[name="tenantName"]', 'محامص الاختبار');
  await page.fill('input[name="fullName"]', 'مالك الاختبار');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/licenses/quick-entry', { timeout: 20000 });
  check('التسجيل يوجّه إلى الإدخال السريع', page.url().includes('quick-entry'));

  // بلا فروع: يجب أن يظهر التوجيه لإنشاء فرع
  await page.waitForSelector('text=أضف فرعًا أو شخصًا أولًا', { timeout: 15000 });
  check('الإدخال السريع يطلب فرعًا أولًا', true);
  await page.screenshot({ path: `${SHOTS}/1-quick-entry-empty.png` });

  // ═══ الفروع ═══
  console.log('\n── الفروع ──');
  await page.goto(`${BASE}/facilities`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("أضف فرعًا")');
  await page.fill('input[name="name"]', 'فرع الملز');
  await page.fill('input[name="city"]', 'الرياض');
  await page.click('button[type="submit"]:has-text("احفظ")');
  await page.waitForSelector('td:has-text("فرع الملز")', { timeout: 15000 });
  check('إنشاء فرع من الواجهة', true);
  await page.screenshot({ path: `${SHOTS}/2-facilities.png` });

  // ═══ الأشخاص + تقنيع الهوية ═══
  console.log('\n── الأشخاص ──');
  await page.goto(`${BASE}/persons`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("أضف شخصًا")');
  await page.fill('input[name="fullName"]', 'أحمد العتيبي');
  await page.fill('input[name="nationalId"]', '1012345678');
  await page.click('button[type="submit"]:has-text("احفظ")');
  await page.waitForSelector('td:has-text("أحمد العتيبي")', { timeout: 15000 });

  const body = await page.textContent('body');
  check('رقم الهوية لا يظهر كاملًا في القائمة', !body.includes('1012345678'));
  check('يظهر مُقنَّعًا بآخر أربعة أرقام', body.includes('5678'));
  await page.screenshot({ path: `${SHOTS}/3-persons.png` });

  // ═══ إضافة ترخيص ═══
  console.log('\n── إضافة ترخيص ──');
  await page.goto(`${BASE}/licenses/new`, { waitUntil: 'networkidle' });
  // نختار بالقيمة: الخيار يحمل اسم النوع + الجهة، فالمطابقة النصية هشّة
  const typeValue = await page.$$eval('select option', (opts) => {
    const hit = opts.find((o) => o.textContent.includes('رخصة البلدية'));
    return hit ? hit.value : null;
  });
  await page.selectOption('select', typeValue);
  await page.waitForSelector('select[name="holderId"]', { timeout: 10000 });

  const suggested = await page.inputValue('input[name="expiryDate"]');
  check('اختيار النوع اقترح تاريخ انتهاء تلقائيًا', /^\d{4}-\d{2}-\d{2}$/.test(suggested), `→ ${suggested}`);

  await page.selectOption('select[name="holderId"]', { label: 'فرع الملز' });
  await page.fill('input[name="number"]', 'ML-2001');
  const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await page.fill('input[name="expiryDate"]', soon);
  await page.fill('input[name="cost"]', '1500');
  await page.click('button[type="submit"]:has-text("احفظ الترخيص")');
  await page.waitForURL(/\/licenses\/[a-z0-9]+$/, { timeout: 20000 });
  check('إنشاء ترخيص ينتقل إلى صفحته', true);

  const licenseUrl = page.url();

  // ═══ صفحة الترخيص: ثلاثة تبويبات ═══
  console.log('\n── صفحة الترخيص ──');
  await page.waitForSelector('[role="tab"]', { timeout: 20000 });
  const tabs = await page.$$eval('[role="tab"]', (els) => els.map((e) => e.textContent.trim()));
  check('ثلاثة تبويبات', tabs.length === 3, `→ ${tabs.join(' | ')}`);
  check('التبويبات هي البيانات والفترات والتنبيهات',
    tabs[0].includes('البيانات') && tabs[1].includes('سجل الفترات') && tabs[2].includes('سجل التنبيهات'));

  const detailText = await page.textContent('body');
  check('التاريخ الميلادي معروض', /\d{4}/.test(detailText));
  check('التاريخ الهجري معروض معه', detailText.includes('هـ'));
  await page.screenshot({ path: `${SHOTS}/4-license-data.png` });

  await page.click('[role="tab"]:has-text("سجل الفترات")');
  await page.waitForSelector('th:has-text("تاريخ الانتهاء")');
  check('تبويب سجل الفترات يعرض جدولًا', true);
  await page.screenshot({ path: `${SHOTS}/5-license-periods.png` });

  await page.click('[role="tab"]:has-text("سجل التنبيهات")');
  await page.waitForSelector('text=لم تُرسل تنبيهات بعد', { timeout: 10000 });
  check('تبويب سجل التنبيهات يعمل', true);

  // ═══ التجديد من الواجهة ═══
  console.log('\n── التجديد ──');
  await page.click('[role="tab"]:has-text("البيانات")');
  await page.click('button:has-text("جدّد")');
  await page.waitForSelector('[role="dialog"]');

  const dialogText = await page.textContent('[role="dialog"]');
  check('الحوار يوضّح أن الفترة القديمة تُحفظ', dialogText.includes('لن تُحذف'));

  const later = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
  await page.fill('[role="dialog"] input[name="expiryDate"]', later);
  await page.fill('[role="dialog"] input[name="cost"]', '1800');
  await page.screenshot({ path: `${SHOTS}/6-renew-dialog.png` });
  await page.click('[role="dialog"] button:has-text("احفظ التجديد")');
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 20000 });

  await page.click('[role="tab"]:has-text("سجل الفترات")');
  await page.waitForTimeout(1500);
  const rows = await page.$$eval('tbody tr', (r) => r.length);
  check('صار في سجل الفترات صفّان', rows === 2, `→ ${rows}`);

  const periodsText = await page.textContent('body');
  check('الفترة القديمة معلّمة بأنها أُغلقت', periodsText.includes('أُغلقت'));
  check('والفترة الجديدة معلّمة كحالية', periodsText.includes('الفترة الحالية'));
  check('التكلفتان محفوظتان (1,500 و 1,800)',
    periodsText.includes('1,500') && periodsText.includes('1,800'));
  await page.screenshot({ path: `${SHOTS}/7-periods-after-renew.png` });

  // ═══ تراخيص بآفاق مختلفة، ليُختبر المسار الممتلئ لا الفارغ ═══
  console.log('\n── تجهيز بيانات للوحة ──');
  const horizons = [-12, 8, 25, 40, 55, 70, 85];
  for (const days of horizons) {
    await page.goto(`${BASE}/licenses/new`, { waitUntil: 'networkidle' });
    const tv = await page.$$eval('select option', (opts) => {
      const hit = opts.find((o) => o.textContent.includes('رخصة البلدية'));
      return hit ? hit.value : null;
    });
    await page.selectOption('select', tv);
    await page.waitForSelector('select[name="holderId"]');
    await page.selectOption('select[name="holderId"]', { label: 'فرع الملز' });
    await page.fill('input[name="number"]', `H-${days}`);
    await page.fill('input[name="expiryDate"]',
      new Date(Date.now() + days * 86400000).toISOString().slice(0, 10));
    await page.click('button[type="submit"]:has-text("احفظ الترخيص")');
    await page.waitForURL(/\/licenses\/[a-z0-9]+$/, { timeout: 20000 });
  }
  check(`أُنشئت ${horizons.length} تراخيص بآفاق مختلفة`, true);

  // ═══ لوحة القيادة ═══
  console.log('\n── لوحة القيادة ──');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=لوحة القيادة');

  const dash = await page.textContent('body');
  for (const label of ['منتهي', 'خلال ٣٠ يومًا', 'خلال ٦٠ يومًا', 'ساري']) {
    check(`بطاقة «${label}» موجودة`, dash.includes(label));
  }
  check('الشريط الزمني ٩٠ يومًا موجود', dash.includes('التسعون يومًا القادمة'));
  check('الشريط الزمني ممتلئ لا فارغ', !dash.includes('لا ينتهي أي ترخيص خلال'));
  check('جدول «يحتاج انتباهك» موجود', dash.includes('يحتاج انتباهك'));
  check('الجدول فيه صفوف فعلية', !dash.includes('لا شيء يقترب من الانتهاء'));

  const cardNums = await page.$$eval('a[href^="/licenses?"] .tabular-nums',
    (els) => els.map((e) => Number(e.textContent)));
  check('بطاقة «منتهي» تعدّ الترخيص المتأخر', cardNums[0] >= 1, `→ ${JSON.stringify(cardNums)}`);
  check('بطاقة «خلال ٣٠ يومًا» تعدّ اثنين', cardNums[1] === 2, `→ ${cardNums[1]}`);
  check('بطاقة «خلال ٦٠ يومًا» تعدّ أربعة', cardNums[2] === 4, `→ ${cardNums[2]}`);

  const overdue = await page.textContent('tbody');
  check('الصف المتأخر يعرض «متأخر»', overdue.includes('متأخر'));
  await page.screenshot({ path: `${SHOTS}/8-dashboard.png`, fullPage: true });

  // ═══ قائمة التراخيص والفلاتر ═══
  console.log('\n── قائمة التراخيص ──');
  await page.goto(`${BASE}/licenses`, { waitUntil: 'networkidle' });
  await page.waitForSelector('td:has-text("رخصة البلدية")');
  check('القائمة تعرض الترخيص', true);

  await page.fill('input[type="search"]', 'ML-2001');
  await page.waitForTimeout(2000);
  check('البحث بالرقم يُبقي النتيجة', (await page.textContent('body')).includes('رخصة البلدية'));
  check('الفلتر انعكس في الرابط', page.url().includes('q=ML-2001'));

  await page.fill('input[type="search"]', 'لا-يوجد-كذا');
  await page.waitForTimeout(2000);
  check('بحث بلا نتائج يُظهر حالة فارغة', (await page.textContent('body')).includes('لا توجد نتائج'));
  await page.screenshot({ path: `${SHOTS}/9-licenses-list.png` });

  // ═══ الإعدادات ═══
  console.log('\n── الإعدادات ──');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=مهل التنبيه والقنوات');

  const settings = await page.textContent('body');
  check('مهل التنبيه معروضة', settings.includes('قبل 60 يوم') || settings.includes('قبل ٦٠'));
  check('«يوم الانتهاء» معروضة', settings.includes('يوم الانتهاء'));
  check('قسم المستخدمين موجود', settings.includes('المستخدمون'));
  check('نموذج الدعوة موجود لصاحب المنشأة', settings.includes('ادعُ عضوًا'));
  await page.screenshot({ path: `${SHOTS}/10-settings.png`, fullPage: true });

  // ═══ الإدخال السريع: اللصق ═══
  console.log('\n── الإدخال السريع (الملف الجاهز) ──');
  await page.goto(`${BASE}/licenses/quick-entry`, { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea', { timeout: 15000 });
  check('شاشة اللصق ظهرت بعد وجود فرع', true);

  // نلصق صفّين بصيغتَي تاريخ مختلفتين
  const pasted = `رخصة بلدية\tفرع الملز\tQ-1\t2028-05-10\nسجل تجاري\tفرع الملز\tQ-2\t15/6/2029`;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), pasted);
  await page.focus('textarea');
  await page.keyboard.press('Control+V');

  await page.waitForTimeout(2000);
  // الصفوف تُعرض كحقول إدخال، وقيم الحقول لا تظهر في textContent
  const values = await page.$$eval('input', (els) => els.map((e) => e.value));
  check('اللصق ولّد صفّين', values.includes('Q-1') && values.includes('Q-2'),
    `→ ${JSON.stringify(values)}`);
  const dates = values.filter((v) => v.includes('2028') || v.includes('2029'));
  check('التاريخان بصيغتيهما المختلفتين وصلا', dates.length === 2, `→ ${JSON.stringify(dates)}`);
  const gridText = await page.textContent('body');
  check('المطابق تعرّف على النوع من نص عربي حر', gridText.includes('رخصة البلدية') || gridText.includes('بلدية'));
  await page.screenshot({ path: `${SHOTS}/11-quick-entry-rows.png`, fullPage: true });

  // ═══ تسجيل الخروج وحماية المسارات ═══
  console.log('\n── الخروج والحماية ──');
  await page.click('button:has-text("خروج")');
  await page.waitForURL('**/login', { timeout: 15000 });
  check('الخروج يوجّه إلى الدخول', page.url().includes('/login'));

  await page.goto(`${BASE}/licenses`, { waitUntil: 'networkidle' });
  check('صفحة محمية بعد الخروج تُعيد التوجيه', page.url().includes('/login'), `→ ${page.url()}`);

  console.log('\n── أخطاء المتصفح ──');
  const realErrors = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('Failed to load resource'),
  );
  check('لا أخطاء JavaScript في الصفحات', realErrors.length === 0,
    `→ ${realErrors.slice(0, 3).join(' | ')}`);

  const realMissing = missing.filter((m) => !m.includes('favicon'));
  check('لا موارد مفقودة (٤٠٤)', realMissing.length === 0, `→ ${realMissing.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail++;
  console.log(`\n💥 ${e.message}`);
  await page.screenshot({ path: `${SHOTS}/error.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`نجح: ${pass}   فشل: ${fail}`);
console.log('═'.repeat(50));
process.exit(fail === 0 ? 0 : 1);
