// ══════════════════════════════════════════════════════════════
//  apps/web/lib/licenses/parsers.spec.ts
//
//  parsers.ts دوال خالصة بلا حالة، وهي أكثر ما سينكسر في المنتج:
//  العميل يلصق بيانات فوضوية، وكل تخمين خاطئ يمرّ دون انتباه يعني
//  تنبيهًا في التاريخ الخطأ — أي غرامة.
// ══════════════════════════════════════════════════════════════

import {
  dateSanityWarning,
  matchLicenseType,
  normalizeArabic,
  normalizeDigits,
  parseClipboard,
  parseFlexibleDate,
  type CatalogEntry,
} from './parsers';

/** كتالوج مصغّر بأسماء ورموز حقيقية من ملف البذور */
const CATALOG: CatalogEntry[] = [
  { id: 't1', code: 'CR', nameAr: 'السجل التجاري', holderType: 'FACILITY' },
  {
    id: 't2',
    code: 'MUNICIPAL',
    nameAr: 'رخصة البلدية (رخصة النشاط التجاري)',
    holderType: 'FACILITY',
  },
  { id: 't3', code: 'CIVIL_DEFENSE', nameAr: 'شهادة السلامة (الدفاع المدني)', holderType: 'FACILITY' },
  { id: 't4', code: 'IQAMA', nameAr: 'الإقامة (رخصة الإقامة)', holderType: 'PERSON' },
  { id: 't5', code: 'HEALTH_CERT', nameAr: 'الشهادة الصحية', holderType: 'PERSON' },
];

/** مختصر: يفشل الاختبار بوضوح إن رجع التحليل خطأً بدل تاريخ */
function ok(raw: string) {
  const parsed = parseFlexibleDate(raw);
  if (!parsed.ok) throw new Error(`توقّعنا نجاح تحليل «${raw}» فجاء: ${parsed.reason}`);
  return parsed;
}

// ══════════════ تحليل التواريخ ══════════════

describe('parseFlexibleDate — الصيغ الأربع في CLAUDE.md', () => {
  it('2027-03-15 — السنة أولًا، ميلادي', () => {
    const d = ok('2027-03-15');
    expect(d.calendar).toBe('GREGORIAN');
    expect(d.gregorianISO).toBe('2027-03-15');
    expect(d.hijriKey).toBeNull();
  });

  it('15/3/2027 — اليوم أولًا (العرف السعودي)', () => {
    const d = ok('15/3/2027');
    expect(d.calendar).toBe('GREGORIAN');
    expect(d.gregorianISO).toBe('2027-03-15');
  });

  it('١٥-٠٣-١٤٤٨ — أرقام عربية وسنة هجرية', () => {
    const d = ok('١٥-٠٣-١٤٤٨');
    expect(d.calendar).toBe('HIJRI');
    expect(d.hijriKey).toBe('1448-03-15');
    expect(d.gregorianISO).toBe('2026-08-28');
  });

  it('1448/03/15 — السنة الهجرية أولًا', () => {
    const d = ok('1448/03/15');
    expect(d.calendar).toBe('HIJRI');
    expect(d.hijriKey).toBe('1448-03-15');
    expect(d.gregorianISO).toBe('2026-08-28');
  });

  it('الصيغتان الهجريتان تعطيان نفس اليوم الميلادي', () => {
    expect(ok('١٥-٠٣-١٤٤٨').gregorianISO).toBe(ok('1448/03/15').gregorianISO);
  });
});

describe('parseFlexibleDate — الأرقام العربية والفارسية', () => {
  it('الأرقام العربية ٠-٩ تُقرأ كالإنجليزية', () => {
    expect(ok('٢٠٢٧-٠٣-١٥').gregorianISO).toBe('2027-03-15');
  });

  it('الأرقام الفارسية ۰-۹ تُقرأ كذلك', () => {
    expect(ok('۲۰۲۷/۰۳/۱۵').gregorianISO).toBe('2027-03-15');
  });

  it('خلط الأرقام العربية والفارسية واللاتينية في نص واحد', () => {
    expect(ok('١٥/۰۳/2027').gregorianISO).toBe('2027-03-15');
  });

  it('normalizeDigits يحوّل الأرقام وحدها ولا يمسّ الحروف', () => {
    expect(normalizeDigits('١٢٣٤٥٦٧٨٩٠')).toBe('1234567890');
    expect(normalizeDigits('۱۲۳۴۵۶۷۸۹۰')).toBe('1234567890');
    expect(normalizeDigits('رقم ٥ فقط')).toBe('رقم 5 فقط');
  });
});

describe('parseFlexibleDate — الفواصل المختلفة', () => {
  it.each(['2027-03-15', '2027/03/15', '2027.03.15', '15 3 2027'])(
    '«%s» يُقرأ بلا مشكلة',
    (raw) => {
      expect(ok(raw).gregorianISO).toBe('2027-03-15');
    },
  );
});

describe('parseFlexibleDate — المدخلات الخاطئة تُرفض لا تُخمَّن', () => {
  it('نص فارغ', () => {
    const d = parseFlexibleDate('   ');
    expect(d.ok).toBe(false);
    expect(d).toMatchObject({ reason: 'التاريخ مطلوب' });
  });

  it('نص غير تاريخ', () => {
    expect(parseFlexibleDate('قريبًا').ok).toBe(false);
  });

  it('شهر ١٣ يُرفض', () => {
    expect(parseFlexibleDate('2027-13-01')).toMatchObject({ ok: false, reason: 'شهر غير صالح' });
  });

  it('٣٠ فبراير يُرفض لأنه لا يوجد', () => {
    expect(parseFlexibleDate('2027-02-30')).toMatchObject({ ok: false, reason: 'تاريخ غير موجود' });
  });

  it('يوم ٠ يُرفض', () => {
    expect(parseFlexibleDate('2027-03-00')).toMatchObject({ ok: false, reason: 'يوم غير صالح' });
  });

  // ٢٩ فبراير موجود في السنة الكبيسة وغير موجود في غيرها —
  // وهذه بالضبط الحالة التي تكشف تحققًا سطحيًا من التواريخ.
  it('٢٩ فبراير ٢٠٢٨ (كبيسة) يُقبل', () => {
    expect(ok('2028-02-29').gregorianISO).toBe('2028-02-29');
  });

  it('٢٩ فبراير ٢٠٢٧ (غير كبيسة) يُرفض', () => {
    expect(parseFlexibleDate('2027-02-29').ok).toBe(false);
  });
});

describe('parseFlexibleDate — حدود التقويم الهجري', () => {
  it('السنة ١٣٠٠ داخل النطاق فتُعامَل هجريًا', () => {
    const d = parseFlexibleDate('1300/01/01');
    // قد يخرج عن مدى أم القرى، لكن يجب ألا يُقرأ ميلاديًا بأي حال
    if (d.ok) expect(d.calendar).toBe('HIJRI');
    else expect(d.reason).toContain('هجري');
  });

  it('السنة ١٦٠١ خارج النطاق فتُعامَل ميلاديًا', () => {
    const d = ok('1601/03/15');
    expect(d.calendar).toBe('GREGORIAN');
  });

  it('السنة ١٢٩٩ تحت النطاق فتُعامَل ميلاديًا', () => {
    expect(ok('1299/03/15').calendar).toBe('GREGORIAN');
  });
});

describe('dateSanityWarning — تنبيه لا يمنع الحفظ', () => {
  const today = new Date('2026-09-04T00:00:00.000Z');

  it('تاريخ قريب بلا تنبيه', () => {
    expect(dateSanityWarning('2027-03-15', today)).toBeNull();
  });

  it('منتهٍ منذ أكثر من عشر سنوات يُنبَّه عليه', () => {
    expect(dateSanityWarning('2010-01-01', today)).toContain('١٠ سنوات');
  });

  it('أبعد من خمسين سنة يُنبَّه عليه — غالبًا خطأ كتابة في السنة', () => {
    expect(dateSanityWarning('2099-01-01', today)).toContain('٥٠ سنة');
  });
});

// ══════════════ مطابقة نوع الترخيص ══════════════

describe('matchLicenseType — الحالات الأربع في CLAUDE.md', () => {
  it('«بلدية» تطابق رخصة البلدية', () => {
    const m = matchLicenseType('بلدية', CATALOG);
    expect(m?.entry.code).toBe('MUNICIPAL');
    expect(m?.confidence).toBe('exact');
  });

  it('«رخصه بلديه» — بلا تاء مربوطة ولا همزات — تطابق أيضًا', () => {
    const m = matchLicenseType('رخصه بلديه', CATALOG);
    expect(m?.entry.code).toBe('MUNICIPAL');
    // ليست exact: الاختصار «بلدية» يسبقها في المصفوفة ويطابق بالاحتواء
    expect(m?.confidence).toBe('likely');
  });

  it('«سجل تجاري» تطابق السجل التجاري مطابقة تامة', () => {
    const m = matchLicenseType('سجل تجاري', CATALOG);
    expect(m?.entry.code).toBe('CR');
    expect(m?.confidence).toBe('exact');
  });

  it('نص لا يطابق شيئًا يعيد null — لا تخمينًا', () => {
    expect(matchLicenseType('شيء لا علاقة له بالتراخيص إطلاقًا', CATALOG)).toBeNull();
    expect(matchLicenseType('zzzz', CATALOG)).toBeNull();
    expect(matchLicenseType('   ', CATALOG)).toBeNull();
  });
});

describe('matchLicenseType — تطبيع الكتابة العربية', () => {
  it.each([
    ['الإقامة', 'IQAMA'],
    ['الاقامه', 'IQAMA'],
    ['اقامة', 'IQAMA'],
    ['إقامه', 'IQAMA'],
  ])('«%s» تطابق %s رغم اختلاف الهمزة والتاء', (input, code) => {
    expect(matchLicenseType(input, CATALOG)?.entry.code).toBe(code);
  });

  it('التشكيل لا يمنع المطابقة', () => {
    expect(matchLicenseType('السِّجِلّ التِّجاري', CATALOG)?.entry.code).toBe('CR');
  });

  it('«ال» التعريف لا تفرّق', () => {
    expect(matchLicenseType('السجل التجاري', CATALOG)?.entry.code).toBe('CR');
    expect(matchLicenseType('سجل تجاري', CATALOG)?.entry.code).toBe('CR');
  });

  it('الاختصارات الإنجليزية مدعومة', () => {
    expect(matchLicenseType('CR', CATALOG)?.entry.code).toBe('CR');
    expect(matchLicenseType('iqama', CATALOG)?.entry.code).toBe('IQAMA');
  });

  it('«دفاع مدني» تطابق شهادة السلامة', () => {
    expect(matchLicenseType('دفاع مدني', CATALOG)?.entry.code).toBe('CIVIL_DEFENSE');
  });

  it('normalizeArabic يوحّد الصور المختلفة', () => {
    expect(normalizeArabic('الإقامة')).toBe(normalizeArabic('الاقامه'));
    expect(normalizeArabic('مُدَّة')).toBe('مده'); // التشكيل يُحذف والتاء المربوطة تصير هاء
    expect(normalizeArabic('مسؤول')).toBe('مسوول'); // ؤ ← و
    expect(normalizeArabic('قائمة')).toBe('قايمه'); // ئ ← ي
  });
});

describe('matchLicenseType — لا يطابق ما ليس في الكتالوج', () => {
  it('اختصار لنوع غائب عن الكتالوج لا يُخترع', () => {
    // «نطاقات» اختصار معروف لـ SAUDIZATION، لكنه ليس في هذا الكتالوج
    expect(matchLicenseType('نطاقات', CATALOG)).toBeNull();
  });
});

// ══════════════ تحليل اللصق ══════════════

describe('parseClipboard — ما يُلصق من إكسل', () => {
  it('يفكّك الأعمدة المفصولة بـ Tab', () => {
    const rows = parseClipboard('رخصة بلدية\tفرع الملز\tML-1\t2027-03-15');
    expect(rows).toEqual([['رخصة بلدية', 'فرع الملز', 'ML-1', '2027-03-15']]);
  });

  it('يفكّك CSV المفصول بفاصلة', () => {
    const rows = parseClipboard('سجل تجاري,الفرع الرئيسي,CR-1,2028-01-01');
    expect(rows[0]).toHaveLength(4);
    expect(rows[0][0]).toBe('سجل تجاري');
  });

  it('يتخطى صف العناوين تلقائيًا', () => {
    const rows = parseClipboard(
      'نوع الترخيص\tالفرع\tالرقم\tتاريخ الانتهاء\n' + 'رخصة بلدية\tفرع الملز\tML-1\t2027-03-15',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe('رخصة بلدية');
  });

  it('لا يتخطى صف بيانات يشبه العناوين بكلمة واحدة فقط', () => {
    const rows = parseClipboard('رقم\tب\tج\td');
    expect(rows).toHaveLength(1);
  });

  it('يتجاهل الأسطر الفارغة', () => {
    expect(parseClipboard('أ\tب\n\n\nج\td\n')).toHaveLength(2);
  });

  it('يتعامل مع نهايات أسطر ويندوز', () => {
    expect(parseClipboard('أ\tب\r\nج\td')).toHaveLength(2);
  });

  it('ينزع علامات الاقتباس حول الخلايا', () => {
    expect(parseClipboard('"رخصة بلدية"\t"فرع الملز"')[0]).toEqual(['رخصة بلدية', 'فرع الملز']);
  });

  it('نص فارغ يعيد مصفوفة فارغة', () => {
    expect(parseClipboard('')).toEqual([]);
    expect(parseClipboard('\n\n')).toEqual([]);
  });
});

// ══════════════ المسار الكامل ══════════════

describe('المسار الكامل: لصق ← مطابقة ← تاريخ', () => {
  it('صفّان بصيغتَي تاريخ مختلفتين يمرّان كاملين', () => {
    const rows = parseClipboard(
      'رخصة بلدية\tفرع الملز\tML-1\t2027-03-15\n' + 'سجل تجاري\tفرع الملز\tCR-1\t١٥-٠٣-١٤٤٨',
    );

    expect(rows).toHaveLength(2);

    const [first, second] = rows.map((cells) => ({
      type: matchLicenseType(cells[0], CATALOG),
      date: parseFlexibleDate(cells[3]),
    }));

    expect(first.type?.entry.code).toBe('MUNICIPAL');
    expect(first.date).toMatchObject({ ok: true, calendar: 'GREGORIAN', gregorianISO: '2027-03-15' });

    expect(second.type?.entry.code).toBe('CR');
    expect(second.date).toMatchObject({ ok: true, calendar: 'HIJRI', hijriKey: '1448-03-15' });
  });
});
