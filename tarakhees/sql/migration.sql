-- ══════════════════════════════════════════════════════════════
--  الترحيل: وحدة التراخيص والتجديدات
--  packages/db/prisma/migrations/<timestamp>_add_license_module/migration.sql
--
--  الأفضل توليد هذا الملف بأمر Prisma بدل نسخه:
--      npx prisma migrate dev --name add_license_module
--  وهذه النسخة للمراجعة، أو للتطبيق اليدوي على قاعدة قائمة.
-- ══════════════════════════════════════════════════════════════

-- ─────────── التعدادات ───────────

CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'UNDER_RENEWAL', 'CANCELLED');
CREATE TYPE "HolderType" AS ENUM ('FACILITY', 'PERSON');
CREATE TYPE "CalendarType" AS ENUM ('GREGORIAN', 'HIJRI');
CREATE TYPE "ReminderChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'IN_APP');
CREATE TYPE "DeliveryStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "RenewalRequestStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- ─────────── المستأجر والمستخدمون ───────────

CREATE TABLE "Tenant" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "crNumber"  TEXT,
    "timezone"  TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Tenant_crNumber_idx" ON "Tenant"("crNumber");

CREATE TABLE "User" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "phone"        TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName"     TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Membership" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "role"      "MemberRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- ─────────── حاملو التراخيص ───────────

CREATE TABLE "Facility" (
    "id"       TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name"     TEXT NOT NULL,
    "crNumber" TEXT,
    "city"     TEXT,
    "address"  TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Facility_tenantId_idx" ON "Facility"("tenantId");

CREATE TABLE "Person" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "fullName"    TEXT NOT NULL,
    "nationalId"  TEXT,
    "nationality" TEXT,
    "jobTitle"    TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Person_tenantId_idx" ON "Person"("tenantId");

-- ─────────── كتالوج أنواع التراخيص ───────────

CREATE TABLE "LicenseType" (
    "id"                 TEXT NOT NULL,
    "code"               TEXT NOT NULL,
    "tenantId"           TEXT,
    "nameAr"             TEXT NOT NULL,
    "nameEn"             TEXT,
    "authority"          TEXT,
    "holderType"         "HolderType" NOT NULL,
    "defaultDurationMo"  INTEGER,
    "defaultCalendar"    "CalendarType" NOT NULL DEFAULT 'GREGORIAN',
    "typicalPenaltyNote" TEXT,
    "renewalUrl"         TEXT,
    "isActive"           BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"          INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LicenseType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LicenseType_code_key" ON "LicenseType"("code");
CREATE INDEX "LicenseType_tenantId_idx" ON "LicenseType"("tenantId");
CREATE INDEX "LicenseType_holderType_sortOrder_idx" ON "LicenseType"("holderType", "sortOrder");

-- ─────────── الترخيص وفتراته ───────────

CREATE TABLE "License" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "licenseTypeId" TEXT NOT NULL,
    "facilityId"    TEXT,
    "personId"      TEXT,
    "number"        TEXT,
    "label"         TEXT,
    "notes"         TEXT,
    "isArchived"    BOOLEAN NOT NULL DEFAULT false,
    "status"        "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentExpiry" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "License_tenantId_status_idx"        ON "License"("tenantId", "status");
CREATE INDEX "License_tenantId_currentExpiry_idx" ON "License"("tenantId", "currentExpiry");
CREATE INDEX "License_facilityId_idx"             ON "License"("facilityId");
CREATE INDEX "License_personId_idx"               ON "License"("personId");

CREATE TABLE "LicensePeriod" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "licenseId"      TEXT NOT NULL,
    "issueDate"      TIMESTAMP(3),
    "expiryDate"     TIMESTAMP(3) NOT NULL,
    "expiryHijri"    TEXT,
    "sourceCalendar" "CalendarType" NOT NULL DEFAULT 'GREGORIAN',
    "cost"           DECIMAL(12,2),
    "isCurrent"      BOOLEAN NOT NULL DEFAULT true,
    "closedAt"       TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicensePeriod_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LicensePeriod_tenantId_expiryDate_idx" ON "LicensePeriod"("tenantId", "expiryDate");
CREATE INDEX "LicensePeriod_licenseId_isCurrent_idx" ON "LicensePeriod"("licenseId", "isCurrent");

CREATE TABLE "Document" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "periodId"   TEXT NOT NULL,
    "fileName"   TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType"   TEXT NOT NULL,
    "sizeBytes"  INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");
CREATE INDEX "Document_periodId_idx" ON "Document"("periodId");

-- ─────────── محرك التنبيهات ───────────

CREATE TABLE "ReminderRule" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel"    "ReminderChannel" NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReminderRule_tenantId_offsetDays_channel_key"
    ON "ReminderRule"("tenantId", "offsetDays", "channel");

CREATE TABLE "ReminderJob" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "periodId"   TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dueOn"      TIMESTAMP(3) NOT NULL,
    "status"     "DeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderJob_pkey" PRIMARY KEY ("id")
);
-- ★ القيد الأهم في النظام: يمنع تكرار إرسال نفس التنبيه
CREATE UNIQUE INDEX "ReminderJob_periodId_offsetDays_key" ON "ReminderJob"("periodId", "offsetDays");
CREATE INDEX "ReminderJob_status_dueOn_idx" ON "ReminderJob"("status", "dueOn");

CREATE TABLE "NotificationLog" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "reminderId"   TEXT NOT NULL,
    "channel"      "ReminderChannel" NOT NULL,
    "recipient"    TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "status"       "DeliveryStatus" NOT NULL,
    "providerRef"  TEXT,
    "errorText"    TEXT,
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationLog_tenantId_sentAt_idx" ON "NotificationLog"("tenantId", "sentAt");
CREATE INDEX "NotificationLog_reminderId_idx"      ON "NotificationLog"("reminderId");

-- ─────────── التجديد كمصدر عمولة ───────────

CREATE TABLE "ServiceProvider" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "phone"         TEXT,
    "specialties"   TEXT[],
    "commissionPct" DECIMAL(5,2),
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RenewalRequest" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "licenseId"    TEXT NOT NULL,
    "providerId"   TEXT,
    "status"       "RenewalRequestStatus" NOT NULL DEFAULT 'NEW',
    "quotedAmount" DECIMAL(12,2),
    "commission"   DECIMAL(12,2),
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"  TIMESTAMP(3),
    CONSTRAINT "RenewalRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RenewalRequest_tenantId_status_idx" ON "RenewalRequest"("tenantId", "status");
CREATE INDEX "RenewalRequest_licenseId_idx"       ON "RenewalRequest"("licenseId");

-- ─────────── الاشتراك ───────────

CREATE TABLE "Subscription" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "plan"         TEXT NOT NULL,
    "licenseQuota" INTEGER NOT NULL DEFAULT 25,
    "startsOn"     TIMESTAMP(3) NOT NULL,
    "endsOn"       TIMESTAMP(3) NOT NULL,
    "amount"       DECIMAL(12,2) NOT NULL,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- ─────────── سجل التدقيق ───────────

CREATE TABLE "AuditLog" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "userId"     TEXT,
    "action"     TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "diff"       JSONB,
    "ipAddress"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_tenantId_createdAt_idx"    ON "AuditLog"("tenantId", "createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx"   ON "AuditLog"("entityType", "entityId");

-- ─────────── المفاتيح الأجنبية ───────────

ALTER TABLE "Membership"      ADD CONSTRAINT "Membership_tenantId_fkey"      FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Membership"      ADD CONSTRAINT "Membership_userId_fkey"        FOREIGN KEY ("userId")        REFERENCES "User"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Facility"        ADD CONSTRAINT "Facility_tenantId_fkey"        FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Person"          ADD CONSTRAINT "Person_tenantId_fkey"          FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "LicenseType"     ADD CONSTRAINT "LicenseType_tenantId_fkey"     FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "License"         ADD CONSTRAINT "License_tenantId_fkey"         FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "License"         ADD CONSTRAINT "License_licenseTypeId_fkey"    FOREIGN KEY ("licenseTypeId") REFERENCES "LicenseType"("id")     ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "License"         ADD CONSTRAINT "License_facilityId_fkey"       FOREIGN KEY ("facilityId")    REFERENCES "Facility"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "License"         ADD CONSTRAINT "License_personId_fkey"         FOREIGN KEY ("personId")      REFERENCES "Person"("id")          ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LicensePeriod"   ADD CONSTRAINT "LicensePeriod_licenseId_fkey"  FOREIGN KEY ("licenseId")     REFERENCES "License"("id")         ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Document"        ADD CONSTRAINT "Document_periodId_fkey"        FOREIGN KEY ("periodId")      REFERENCES "LicensePeriod"("id")   ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "ReminderRule"    ADD CONSTRAINT "ReminderRule_tenantId_fkey"    FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "ReminderJob"     ADD CONSTRAINT "ReminderJob_periodId_fkey"     FOREIGN KEY ("periodId")      REFERENCES "LicensePeriod"("id")   ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_reminderId_fkey" FOREIGN KEY ("reminderId")  REFERENCES "ReminderJob"("id")     ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "RenewalRequest"  ADD CONSTRAINT "RenewalRequest_licenseId_fkey" FOREIGN KEY ("licenseId")     REFERENCES "License"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RenewalRequest"  ADD CONSTRAINT "RenewalRequest_providerId_fkey" FOREIGN KEY ("providerId")   REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription"    ADD CONSTRAINT "Subscription_tenantId_fkey"    FOREIGN KEY ("tenantId")      REFERENCES "Tenant"("id")          ON DELETE CASCADE  ON UPDATE CASCADE;


-- ══════════════════════════════════════════════════════════════
--  إضافات لا يستطيع Prisma التعبير عنها — ضعها في ملف ترحيل منفصل
--  باسم <timestamp>_license_module_hardening/migration.sql
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
