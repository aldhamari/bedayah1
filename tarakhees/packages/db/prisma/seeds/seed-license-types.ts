// ══════════════════════════════════════════════════════════════
//  packages/db/prisma/seeds/license-types.ts
//
//  كتالوج أنواع التراخيص السعودية — أنواع عامة (tenantId = null)
//  يظهر لكل المستأجرين. البذور قابلة لإعادة التشغيل بأمان (upsert على code).
//
//  التشغيل:  npx tsx prisma/seeds/license-types.ts
//
//  ⚠️ المدد والغرامات المذكورة تقريبية للإرشاد فقط، وتتغير بتغيّر الأنظمة.
//     راجعها قبل الإطلاق ولا تعرضها للعميل كرقم قطعي.
// ══════════════════════════════════════════════════════════════

import { PrismaClient, HolderType, CalendarType } from '@prisma/client';

const prisma = new PrismaClient();

type SeedType = {
  code: string;
  nameAr: string;
  nameEn?: string;
  authority?: string;
  holderType: HolderType;
  defaultDurationMo?: number;
  defaultCalendar?: CalendarType;
  typicalPenaltyNote?: string;
  sortOrder: number;
};

const LICENSE_TYPES: SeedType[] = [
  // ───────── على مستوى المنشأة ─────────
  {
    code: 'CR',
    nameAr: 'السجل التجاري',
    nameEn: 'Commercial Registration',
    authority: 'وزارة التجارة',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'تعليق السجل ثم شطبه، وتوقف التعاملات البنكية والحكومية',
    sortOrder: 10,
  },
  {
    code: 'MUNICIPAL',
    nameAr: 'رخصة البلدية (رخصة النشاط التجاري)',
    nameEn: 'Municipal License',
    authority: 'وزارة الشؤون البلدية والقروية والإسكان',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامة مالية واحتمال إغلاق المحل إداريًا',
    sortOrder: 20,
  },
  {
    code: 'CIVIL_DEFENSE',
    nameAr: 'شهادة السلامة (الدفاع المدني)',
    nameEn: 'Civil Defense Safety Certificate',
    authority: 'المديرية العامة للدفاع المدني',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامة، وقد تُرفض مطالبات التأمين عند وقوع حادث',
    sortOrder: 30,
  },
  {
    code: 'ZAKAT_CERT',
    nameAr: 'الشهادة الزكوية',
    nameEn: 'Zakat Certificate',
    authority: 'هيئة الزكاة والضريبة والجمارك',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'توقف صرف المستخلصات وتعطل التعاقد الحكومي',
    sortOrder: 40,
  },
  {
    code: 'VAT_REG',
    nameAr: 'شهادة التسجيل في ضريبة القيمة المضافة',
    nameEn: 'VAT Registration',
    authority: 'هيئة الزكاة والضريبة والجمارك',
    holderType: 'FACILITY',
    typicalPenaltyNote: 'لا تنتهي عادةً — تُتابَع الإقرارات الدورية بدلًا منها',
    sortOrder: 50,
  },
  {
    code: 'GOSI_CERT',
    nameAr: 'شهادة الاشتراك في التأمينات الاجتماعية',
    nameEn: 'GOSI Certificate',
    authority: 'المؤسسة العامة للتأمينات الاجتماعية',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'تعطل الخدمات الحكومية وغرامات تأخير على الاشتراكات',
    sortOrder: 60,
  },
  {
    code: 'SAUDIZATION',
    nameAr: 'شهادة الالتزام بالتوطين (نطاقات)',
    nameEn: 'Saudization Certificate',
    authority: 'وزارة الموارد البشرية والتنمية الاجتماعية',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'تجميد إصدار وتجديد رخص العمل والتأشيرات',
    sortOrder: 70,
  },
  {
    code: 'EJAR_CONTRACT',
    nameAr: 'عقد الإيجار الموثق (إيجار)',
    nameEn: 'Registered Lease Contract',
    authority: 'الهيئة العامة للعقار — شبكة إيجار',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'ضعف الموقف النظامي عند النزاع، وتعطل تجديد رخص مرتبطة به',
    sortOrder: 80,
  },
  {
    code: 'CHAMBER',
    nameAr: 'عضوية الغرفة التجارية',
    nameEn: 'Chamber of Commerce Membership',
    authority: 'الغرفة التجارية',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'تعذر تصديق المستندات والمعاملات التجارية',
    sortOrder: 90,
  },
  {
    code: 'SFDA_LICENSE',
    nameAr: 'ترخيص هيئة الغذاء والدواء',
    nameEn: 'SFDA License',
    authority: 'الهيئة العامة للغذاء والدواء',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'إيقاف النشاط الغذائي أو الدوائي',
    sortOrder: 100,
  },
  {
    code: 'SIGNAGE',
    nameAr: 'الرخصة الإعلانية (لوحة المحل)',
    nameEn: 'Signage Permit',
    authority: 'البلدية',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامة وإزالة اللوحة',
    sortOrder: 110,
  },
  {
    code: 'TRADEMARK',
    nameAr: 'تسجيل العلامة التجارية',
    nameEn: 'Trademark Registration',
    authority: 'الهيئة السعودية للملكية الفكرية',
    holderType: 'FACILITY',
    defaultDurationMo: 120,
    typicalPenaltyNote: 'سقوط الحماية وإتاحة العلامة للتسجيل من الغير',
    sortOrder: 120,
  },
  {
    code: 'INVESTMENT_LIC',
    nameAr: 'ترخيص الاستثمار الأجنبي',
    nameEn: 'Investment License',
    authority: 'وزارة الاستثمار',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامات وإيقاف النشاط للمنشآت غير السعودية',
    sortOrder: 130,
  },
  {
    code: 'VEHICLE_REG',
    nameAr: 'استمارة المركبة (رخصة السير)',
    nameEn: 'Vehicle Registration',
    authority: 'الإدارة العامة للمرور',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامة مرورية وحجز المركبة',
    sortOrder: 140,
  },
  {
    code: 'VEHICLE_INSPECT',
    nameAr: 'الفحص الدوري للمركبة',
    nameEn: 'Periodic Vehicle Inspection',
    authority: 'المرور',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'غرامة، ورفض تجديد الاستمارة',
    sortOrder: 150,
  },
  {
    code: 'INSURANCE_POLICY',
    nameAr: 'وثيقة التأمين',
    nameEn: 'Insurance Policy',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'انكشاف كامل أمام الخسائر والمطالبات',
    sortOrder: 160,
  },
  {
    code: 'ISO_CERT',
    nameAr: 'شهادة الجودة (ISO)',
    nameEn: 'ISO Certificate',
    holderType: 'FACILITY',
    defaultDurationMo: 36,
    typicalPenaltyNote: 'فقدان الأهلية في المنافسات والمناقصات',
    sortOrder: 170,
  },
  {
    code: 'DOMAIN_HOSTING',
    nameAr: 'النطاق والاستضافة',
    nameEn: 'Domain & Hosting',
    holderType: 'FACILITY',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'توقف الموقع، وقد يُفقد النطاق نهائيًا',
    sortOrder: 180,
  },

  // ───────── على مستوى الشخص ─────────
  {
    code: 'IQAMA',
    nameAr: 'الإقامة (رخصة الإقامة)',
    nameEn: 'Residency Permit',
    authority: 'المديرية العامة للجوازات',
    holderType: 'PERSON',
    defaultDurationMo: 12,
    defaultCalendar: 'HIJRI',
    typicalPenaltyNote: 'غرامة تتضاعف بالتكرار، وقد تصل للترحيل ومنع الاستقدام',
    sortOrder: 200,
  },
  {
    code: 'WORK_PERMIT',
    nameAr: 'رخصة العمل',
    nameEn: 'Work Permit',
    authority: 'وزارة الموارد البشرية والتنمية الاجتماعية',
    holderType: 'PERSON',
    defaultDurationMo: 12,
    defaultCalendar: 'HIJRI',
    typicalPenaltyNote: 'غرامة على المنشأة عن كل عامل بلا رخصة سارية',
    sortOrder: 210,
  },
  {
    code: 'EXIT_REENTRY',
    nameAr: 'تأشيرة الخروج والعودة',
    nameEn: 'Exit / Re-entry Visa',
    authority: 'المديرية العامة للجوازات',
    holderType: 'PERSON',
    defaultDurationMo: 2,
    defaultCalendar: 'HIJRI',
    typicalPenaltyNote: 'انقطاع العامل عن العمل وتبعات نظامية على المنشأة',
    sortOrder: 220,
  },
  {
    code: 'HEALTH_CERT',
    nameAr: 'الشهادة الصحية للعاملين',
    nameEn: 'Health Certificate',
    authority: 'البلدية / وزارة الصحة',
    holderType: 'PERSON',
    defaultDurationMo: 6,
    typicalPenaltyNote: 'غرامة، وإيقاف العامل عن العمل في الأنشطة الغذائية',
    sortOrder: 230,
  },
  {
    code: 'PASSPORT',
    nameAr: 'جواز السفر',
    nameEn: 'Passport',
    holderType: 'PERSON',
    defaultDurationMo: 60,
    typicalPenaltyNote: 'تعذر تجديد الإقامة أو السفر',
    sortOrder: 240,
  },
  {
    code: 'DRIVING_LICENSE',
    nameAr: 'رخصة القيادة',
    nameEn: 'Driving License',
    authority: 'الإدارة العامة للمرور',
    holderType: 'PERSON',
    defaultDurationMo: 60,
    typicalPenaltyNote: 'غرامة مرورية، وبطلان التغطية التأمينية عند الحادث',
    sortOrder: 250,
  },
  {
    code: 'PROFESSIONAL_LIC',
    nameAr: 'الرخصة المهنية / التصنيف المهني',
    nameEn: 'Professional License',
    authority: 'الجهة المهنية المختصة',
    holderType: 'PERSON',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'عدم أهلية مزاولة المهنة',
    sortOrder: 260,
  },
  {
    code: 'EMPLOYMENT_CONTRACT',
    nameAr: 'عقد العمل',
    nameEn: 'Employment Contract',
    holderType: 'PERSON',
    defaultDurationMo: 12,
    typicalPenaltyNote: 'ضعف الموقف النظامي عند النزاع العمالي',
    sortOrder: 270,
  },
  {
    code: 'NATIONAL_ID',
    nameAr: 'بطاقة الهوية الوطنية',
    nameEn: 'National ID',
    authority: 'الأحوال المدنية',
    holderType: 'PERSON',
    defaultDurationMo: 120,
    typicalPenaltyNote: 'غرامة تأخير التجديد',
    sortOrder: 280,
  },
];

// قواعد التنبيه الافتراضية لأي مستأجر جديد
export const DEFAULT_REMINDER_OFFSETS = [60, 30, 7, 0];

async function main() {
  let created = 0;
  let updated = 0;

  for (const t of LICENSE_TYPES) {
    const existing = await prisma.licenseType.findUnique({ where: { code: t.code } });

    await prisma.licenseType.upsert({
      where: { code: t.code },
      create: {
        code: t.code,
        tenantId: null,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        authority: t.authority,
        holderType: t.holderType,
        defaultDurationMo: t.defaultDurationMo,
        defaultCalendar: t.defaultCalendar ?? 'GREGORIAN',
        typicalPenaltyNote: t.typicalPenaltyNote,
        sortOrder: t.sortOrder,
      },
      // نحدّث بيانات الكتالوج فقط، ولا نلمس isActive حتى لا نعيد تفعيل ما أطفأه المشغّل
      update: {
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        authority: t.authority,
        holderType: t.holderType,
        defaultDurationMo: t.defaultDurationMo,
        defaultCalendar: t.defaultCalendar ?? 'GREGORIAN',
        typicalPenaltyNote: t.typicalPenaltyNote,
        sortOrder: t.sortOrder,
      },
    });

    existing ? updated++ : created++;
  }

  console.log(`أنواع التراخيص — أُنشئ: ${created}، حُدّث: ${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
