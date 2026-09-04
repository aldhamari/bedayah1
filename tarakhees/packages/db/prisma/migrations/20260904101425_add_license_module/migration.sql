-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'UNDER_RENEWAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HolderType" AS ENUM ('FACILITY', 'PERSON');

-- CreateEnum
CREATE TYPE "CalendarType" AS ENUM ('GREGORIAN', 'HIJRI');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RenewalRequestStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MANAGER', 'VIEWER');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crNumber" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "crNumber" TEXT,
    "city" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalId" TEXT,
    "nationality" TEXT,
    "jobTitle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "authority" TEXT,
    "holderType" "HolderType" NOT NULL,
    "defaultDurationMo" INTEGER,
    "defaultCalendar" "CalendarType" NOT NULL DEFAULT 'GREGORIAN',
    "typicalPenaltyNote" TEXT,
    "renewalUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LicenseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseTypeId" TEXT NOT NULL,
    "facilityId" TEXT,
    "personId" TEXT,
    "number" TEXT,
    "label" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicensePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "expiryHijri" TEXT,
    "sourceCalendar" "CalendarType" NOT NULL DEFAULT 'GREGORIAN',
    "cost" DECIMAL(12,2),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicensePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "providerRef" TEXT,
    "errorText" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "specialties" TEXT[],
    "commissionPct" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "providerId" TEXT,
    "status" "RenewalRequestStatus" NOT NULL DEFAULT 'NEW',
    "quotedAmount" DECIMAL(12,2),
    "commission" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RenewalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "licenseQuota" INTEGER NOT NULL DEFAULT 25,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tenant_crNumber_idx" ON "Tenant"("crNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Facility_tenantId_idx" ON "Facility"("tenantId");

-- CreateIndex
CREATE INDEX "Person_tenantId_idx" ON "Person"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseType_code_key" ON "LicenseType"("code");

-- CreateIndex
CREATE INDEX "LicenseType_tenantId_idx" ON "LicenseType"("tenantId");

-- CreateIndex
CREATE INDEX "LicenseType_holderType_sortOrder_idx" ON "LicenseType"("holderType", "sortOrder");

-- CreateIndex
CREATE INDEX "License_tenantId_status_idx" ON "License"("tenantId", "status");

-- CreateIndex
CREATE INDEX "License_tenantId_currentExpiry_idx" ON "License"("tenantId", "currentExpiry");

-- CreateIndex
CREATE INDEX "License_facilityId_idx" ON "License"("facilityId");

-- CreateIndex
CREATE INDEX "License_personId_idx" ON "License"("personId");

-- CreateIndex
CREATE INDEX "LicensePeriod_tenantId_expiryDate_idx" ON "LicensePeriod"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "LicensePeriod_licenseId_isCurrent_idx" ON "LicensePeriod"("licenseId", "isCurrent");

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_periodId_idx" ON "Document"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_tenantId_offsetDays_channel_key" ON "ReminderRule"("tenantId", "offsetDays", "channel");

-- CreateIndex
CREATE INDEX "ReminderJob_status_dueOn_idx" ON "ReminderJob"("status", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderJob_periodId_offsetDays_key" ON "ReminderJob"("periodId", "offsetDays");

-- CreateIndex
CREATE INDEX "NotificationLog_tenantId_sentAt_idx" ON "NotificationLog"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationLog_reminderId_idx" ON "NotificationLog"("reminderId");

-- CreateIndex
CREATE INDEX "RenewalRequest_tenantId_status_idx" ON "RenewalRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RenewalRequest_licenseId_idx" ON "RenewalRequest"("licenseId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseType" ADD CONSTRAINT "LicenseType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_licenseTypeId_fkey" FOREIGN KEY ("licenseTypeId") REFERENCES "LicenseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicensePeriod" ADD CONSTRAINT "LicensePeriod_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "LicensePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderJob" ADD CONSTRAINT "ReminderJob_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "LicensePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "ReminderJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalRequest" ADD CONSTRAINT "RenewalRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
