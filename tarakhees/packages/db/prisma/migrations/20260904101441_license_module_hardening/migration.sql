-- ══════════════════════════════════════════════════════════════
--  license_module_hardening
--
--  الإضافات الخمس التي لا يستطيع Prisma التعبير عنها في المخطط.
--  المصدر: نهاية sql/migration.sql (السطور ٢٨٢–٣١٣) — منقولة كما هي.
--
--  ملاحظة على الانحراف (drift): هذه الكائنات خارج ما يمثّله مخطط Prisma،
--  ومقارِن Prisma لا يراها — تحقّقنا: `migrate diff` بعد تطبيقها يعيد
--  "empty migration"، فلا يقترح إسقاطها. لكن `migrate reset` يمسح القاعدة
--  ويعيد تشغيل الترحيلات بالترتيب، فتُعاد هذه من هنا. لا تحذف هذا الملف.
-- ══════════════════════════════════════════════════════════════

-- ١) فترة حالية واحدة فقط لكل ترخيص — يمنع تلف البيانات عند التجديد المتزامن
CREATE UNIQUE INDEX "LicensePeriod_one_current_per_license"
    ON "LicensePeriod"("licenseId") WHERE "isCurrent" = true;

-- ٢) فهرس جزئي للوحة القيادة — يتجاهل المؤرشف والملغي
CREATE INDEX "License_active_expiry_idx"
    ON "License"("tenantId", "currentExpiry")
    WHERE "isArchived" = false AND "status" <> 'CANCELLED';

-- ٣) الترخيص إما لمنشأة أو لشخص، لا كليهما ولا لا شيء
ALTER TABLE "License" ADD CONSTRAINT "License_one_holder_chk"
    CHECK (("facilityId" IS NOT NULL) <> ("personId" IS NOT NULL));

-- ٤) سجل الإشعارات غير قابل للتعديل أو الحذف — حمايتك التعاقدية
--    (القاعدة الثابتة رقم ٢ في CLAUDE.md، مفروضة على مستوى قاعدة البيانات
--     لا على مستوى التطبيق — فلا يلتف عليها كود ولا اتصال مباشر بالقاعدة)
CREATE OR REPLACE FUNCTION block_notification_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'NotificationLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationLog_no_update"
    BEFORE UPDATE OR DELETE ON "NotificationLog"
    FOR EACH ROW EXECUTE FUNCTION block_notification_mutation();

-- ٥) تشفير رقم الهوية/الإقامة
--    فعّل الامتداد، وشفّر في طبقة التطبيق بمفتاح من متغيرات البيئة (لا تضع المفتاح هنا)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
