// ══════════════════════════════════════════════════════════════
//  apps/web/lib/licenses/parsers.ts
//
//  منطق تحليل المُدخلات — دوال خالصة بلا حالة، قابلة للاختبار وحدها.
//  هذه أهم ٢٠٠ سطر في المنتج: العميل يلصق بيانات فوضوية من إكسل،
//  وكل حقل يخمّنه النظام صحيحًا هو حقل لا يكتبه بيده.
//
//  التبعية الوحيدة: npm i @umalqura/core   (تحويل أم القرى الهجري)
// ══════════════════════════════════════════════════════════════

import umalqura from '@umalqura/core';

// ─────────────── تطبيع النصوص العربية ───────────────

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** يوحّد صور الحروف العربية ليصبح "الاقامه" و"الإقامة" نصًا واحدًا */
export function normalizeArabic(input: string): string {
  return input
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** ٠١٢٣ و ۰۱۲۳ ← 0123 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function stripLeadingAl(s: string): string {
  return s.replace(/(^|\s)ال/g, '$1');
}

// ─────────────── تحليل التواريخ ───────────────

export type ParsedDate =
  | { ok: true; calendar: 'GREGORIAN' | 'HIJRI'; gregorianISO: string; hijriKey: string | null }
  | { ok: false; reason: string };

const HIJRI_YEAR_MIN = 1300;
const HIJRI_YEAR_MAX = 1600;

/**
 * يقبل ما يكتبه الناس فعلًا:
 *   2027-03-15 · 15/3/2027 · 15.3.2027 · ١٥-٠٣-١٤٤٨ · 1448/03/15
 *
 * السنة بين ١٣٠٠ و١٦٠٠ تُعامل كهجرية وتُحوَّل تلقائيًا بأم القرى.
 * ترتيب اليوم/الشهر: يوم أولًا (العرف السعودي) إلا إذا بدأ النص بالسنة.
 */
export function parseFlexibleDate(raw: string): ParsedDate {
  const s = normalizeDigits(raw).trim();
  if (!s) return { ok: false, reason: 'التاريخ مطلوب' };

  const m = s.match(/^(\d{1,4})\s*[^\d]\s*(\d{1,2})\s*[^\d]\s*(\d{1,4})$/);
  if (!m) return { ok: false, reason: 'صيغة غير مفهومة' };

  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];

  let year: number, month: number, day: number;

  if (m[1].length === 4 || a > 31) {
    // السنة أولًا: 2027-03-15
    [year, month, day] = [a, b, c];
  } else {
    // اليوم أولًا: 15/03/2027
    [day, month, year] = [a, b, c];
  }

  if (year < 100) year += year < 50 ? 2000 : 1900;
  if (month < 1 || month > 12) return { ok: false, reason: 'شهر غير صالح' };
  if (day < 1 || day > 31) return { ok: false, reason: 'يوم غير صالح' };

  // ── هجري ──
  if (year >= HIJRI_YEAR_MIN && year <= HIJRI_YEAR_MAX) {
    try {
      const uq = umalqura(year, month, day);
      const g = uq.date;
      return {
        ok: true,
        calendar: 'HIJRI',
        gregorianISO: toISODate(g.getFullYear(), g.getMonth() + 1, g.getDate()),
        hijriKey: `${year}-${pad(month)}-${pad(day)}`,
      };
    } catch {
      return { ok: false, reason: 'تاريخ هجري خارج النطاق المدعوم' };
    }
  }

  // ── ميلادي ──
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return { ok: false, reason: 'تاريخ غير موجود' };
  }

  return { ok: true, calendar: 'GREGORIAN', gregorianISO: toISODate(year, month, day), hijriKey: null };
}

/** تنبيهات لا تمنع الحفظ، لكنها تلفت النظر لخطأ إدخال محتمل */
export function dateSanityWarning(iso: string, today = new Date()): string | null {
  const target = new Date(`${iso}T00:00:00.000Z`);
  const years = (target.getTime() - today.getTime()) / (365.25 * 86_400_000);
  if (years < -10) return 'منتهي منذ أكثر من ١٠ سنوات — تأكد من التاريخ';
  if (years > 50) return 'أبعد من ٥٠ سنة — تأكد من التاريخ';
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// ─────────────── مطابقة نوع الترخيص ───────────────

export type CatalogEntry = { id: string; code: string; nameAr: string; holderType: 'FACILITY' | 'PERSON' };

/** اختصارات يكتبها الناس بدل الاسم الرسمي */
const ALIASES: Record<string, string[]> = {
  CR: ['سجل', 'سجل تجاري', 'س ت', 'cr'],
  MUNICIPAL: ['بلدية', 'رخصه بلديه', 'رخصة المحل', 'بلدي'],
  CIVIL_DEFENSE: ['دفاع مدني', 'سلامه', 'شهاده سلامه'],
  ZAKAT_CERT: ['زكاه', 'شهاده زكويه', 'زكوية'],
  VAT_REG: ['ضريبه', 'قيمه مضافه', 'vat'],
  GOSI_CERT: ['تامينات', 'التامينات الاجتماعيه', 'gosi'],
  SAUDIZATION: ['نطاقات', 'توطين', 'سعوده'],
  EJAR_CONTRACT: ['ايجار', 'عقد ايجار', 'عقد المحل'],
  CHAMBER: ['غرفه', 'الغرفه التجاريه'],
  SFDA_LICENSE: ['غذاء ودواء', 'هيئه الغذاء', 'sfda'],
  SIGNAGE: ['لوحه', 'رخصه اعلانيه', 'لوحة المحل'],
  IQAMA: ['اقامه', 'اقامة العامل', 'iqama'],
  WORK_PERMIT: ['رخصه عمل', 'مكتب العمل'],
  HEALTH_CERT: ['شهاده صحيه', 'كرت صحي', 'صحيه'],
  PASSPORT: ['جواز', 'باسبور'],
  DRIVING_LICENSE: ['رخصه قياده', 'رخصه سياقه'],
  VEHICLE_REG: ['استماره', 'رخصه سير'],
  VEHICLE_INSPECT: ['فحص دوري', 'الفحص'],
  INSURANCE_POLICY: ['تامين', 'وثيقه تامين'],
};

export type TypeMatch = { entry: CatalogEntry; confidence: 'exact' | 'likely' | 'guess' } | null;

/**
 * يطابق نصًا حرًا بنوع من الكتالوج.
 * لا يرجع نتيجة ضعيفة أبدًا — الخانة الفارغة أفضل من تخمين خاطئ
 * يمرّ دون أن ينتبه له المستخدم.
 */
export function matchLicenseType(raw: string, catalog: CatalogEntry[]): TypeMatch {
  const q = stripLeadingAl(normalizeArabic(raw));
  if (!q) return null;

  const byCode = new Map(catalog.map((c) => [c.code, c]));

  // ١. مطابقة تامة على الاسم
  for (const c of catalog) {
    if (stripLeadingAl(normalizeArabic(c.nameAr)) === q) return { entry: c, confidence: 'exact' };
  }

  // ٢. اختصار معروف
  for (const [code, aliases] of Object.entries(ALIASES)) {
    const entry = byCode.get(code);
    if (!entry) continue;
    for (const alias of aliases) {
      const a = stripLeadingAl(normalizeArabic(alias));
      if (a === q) return { entry, confidence: 'exact' };
      if (q.includes(a) || a.includes(q)) return { entry, confidence: 'likely' };
    }
  }

  // ٣. تداخل الكلمات
  const qTokens = new Set(q.split(' ').filter((t) => t.length > 2));
  if (qTokens.size === 0) return null;

  let best: { entry: CatalogEntry; score: number } | null = null;

  for (const c of catalog) {
    const cTokens = stripLeadingAl(normalizeArabic(c.nameAr)).split(' ').filter((t) => t.length > 2);
    if (cTokens.length === 0) continue;

    const hits = cTokens.filter((t) => qTokens.has(t)).length;
    const score = hits / Math.max(qTokens.size, cTokens.length);

    if (score > 0 && (!best || score > best.score)) best = { entry: c, score };
  }

  if (!best || best.score < 0.5) return null;
  return { entry: best.entry, confidence: best.score >= 0.8 ? 'likely' : 'guess' };
}

// ─────────────── تحليل اللصق ───────────────

export type PastedRow = string[];

const HEADER_HINTS = ['نوع', 'ترخيص', 'تاريخ', 'انتهاء', 'رقم', 'الجهه', 'الفرع', 'الاسم'];

/**
 * يفكّك ما يُلصق من إكسل (مفصول بـ Tab) أو من CSV (فاصلة).
 * يتخطى صف العناوين تلقائيًا إن وُجد.
 */
export function parseClipboard(text: string): PastedRow[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : lines.every((l) => l.includes(',')) ? ',' : '\t';

  const rows = lines.map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, '$1')),
  );

  const first = normalizeArabic(rows[0].join(' '));
  const looksLikeHeader =
    HEADER_HINTS.filter((h) => first.includes(normalizeArabic(h))).length >= 2;

  return looksLikeHeader ? rows.slice(1) : rows;
}
