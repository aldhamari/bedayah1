# نظام متابعة التراخيص والتجديدات — تصميم النسخة الأولى

> منتج SaaS متعدد المستأجرين (Multi-tenant) لمتابعة تواريخ انتهاء التراخيص والشهادات والعقود في المنشآت الصغيرة، والتنبيه المبكر قبل وقوع الغرامة.

---

## ١. نطاق النسخة الأولى

**داخل النطاق:**
- إدخال التراخيص يدويًا (نوع، رقم، جهة الإصدار، تاريخ الانتهاء، مرفق)
- تنبيهات تلقائية قبل ٦٠ و٣٠ و٧ أيام + تنبيه يوم الانتهاء + متابعة أسبوعية بعد التأخر
- لوحة قيادة بألوان حسب القرب من الانتهاء
- تسجيل التجديد كفترة جديدة مع حفظ التاريخ الكامل
- سجل تنبيهات غير قابل للتعديل (حماية تعاقدية لك)
- طلب تجديد يُحوَّل لمزوّد خدمة (مصدر العمولة)

**خارج النطاق عمدًا (لا تبنِه الآن):**
- التكامل المباشر مع أنظمة الجهات الحكومية — لا يوجد وصول مفتوح، والاعتماد عليه يوقف المشروع
- استخراج البيانات تلقائيًا من صور التراخيص (OCR)
- تطبيق جوال — الويب المتجاوب يكفي
- الدفع الإلكتروني داخل المنصة — حصّل الاشتراك يدويًا لأول ٢٠ عميل

---

## ٢. القرارات التصميمية الخمسة المهمة

**١. فصل `License` عن `LicensePeriod`**
الترخيص له هوية ثابتة (رقم السجل التجاري لا يتغير)، لكن له فترات متعددة (إصدار → انتهاء). التجديد = إنشاء فترة جديدة، لا تعديل القديمة. هذا يمنحك تاريخًا كاملًا، ويجعل سؤال "كم مرة تأخر هذا العميل؟" استعلامًا واحدًا.

**٢. تخزين التاريخ الميلادي والهجري معًا**
كثير من التراخيص السعودية تنتهي بتاريخ هجري (الإقامات، بعض رخص البلدية). اجعل الميلادي هو المرجع للحسابات والفهرسة، واحفظ الهجري كنص للعرض، مع حقل يحدد أيهما الأصل. حوِّل مرة واحدة عند الإدخال بمكتبة أم القرى وثبّت إصدارها.

**٣. مفتاح تكرار (Idempotency) على التنبيهات**
قيد فريد على `(periodId, offsetDays)` يمنع إرسال نفس التنبيه مرتين إذا أُعيد تشغيل المهمة أو تعطلت في منتصفها. هذا أكثر شيء يفسد أنظمة التنبيه.

**٤. `status` محسوب ومخزَّن**
احسبه ليلًا واحفظه في العمود، حتى تكون القوائم والفلاتر سريعة بدون حساب في كل استعلام.

**٥. عزل المستأجرين على مستوى الاستعلام**
`tenantId` في كل جدول + Prisma Client Extension يحقن الشرط تلقائيًا. لا تعتمد على ذاكرة المطوّر في كل `findMany`.

---

## ٣. مخطط قاعدة البيانات (Prisma)

```prisma
// ═══════════ التعدادات ═══════════

enum LicenseStatus {
  ACTIVE          // ساري
  EXPIRING_SOON   // يقترب من الانتهاء
  EXPIRED         // منتهي
  UNDER_RENEWAL   // قيد التجديد
  CANCELLED       // ملغي
}

enum HolderType {
  FACILITY        // مرتبط بالمنشأة أو الفرع
  PERSON          // مرتبط بشخص (إقامة، شهادة صحية، رخصة مهنية)
}

enum CalendarType {
  GREGORIAN
  HIJRI
}

enum ReminderChannel {
  WHATSAPP
  EMAIL
  SMS
  IN_APP
}

enum DeliveryStatus {
  SCHEDULED
  SENT
  FAILED
  CANCELLED
}

enum RenewalRequestStatus {
  NEW
  ASSIGNED
  IN_PROGRESS
  DONE
  CANCELLED
}

enum MemberRole {
  OWNER
  MANAGER
  VIEWER
}

// ═══════════ المستأجر والمستخدمون ═══════════

model Tenant {
  id            String   @id @default(cuid())
  name          String                          // اسم المنشأة
  crNumber      String?                         // رقم السجل التجاري الرئيسي
  timezone      String   @default("Asia/Riyadh")
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  members       Membership[]
  facilities    Facility[]
  persons       Person[]
  licenses      License[]
  reminderRules ReminderRule[]
  subscription  Subscription?

  @@index([crNumber])
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  phone        String?                          // بصيغة E.164 لواتساب
  passwordHash String                           // Argon2id — انسخ نفس إعدادات مشروعك الحالي
  fullName     String
  createdAt    DateTime @default(now())

  memberships  Membership[]
}

model Membership {
  id        String     @id @default(cuid())
  tenantId  String
  userId    String
  role      MemberRole @default(VIEWER)
  createdAt DateTime   @default(now())

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId])
  @@index([userId])
}

// ═══════════ حاملو التراخيص ═══════════

model Facility {
  id        String    @id @default(cuid())
  tenantId  String
  name      String                              // الفرع الرئيسي، فرع الملز...
  crNumber  String?
  city      String?
  address   String?
  isActive  Boolean   @default(true)

  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  licenses  License[]

  @@index([tenantId])
}

model Person {
  id           String    @id @default(cuid())
  tenantId     String
  fullName     String
  nationalId   String?                          // هوية / إقامة — حقل حساس، شفّره عند التخزين
  nationality  String?
  jobTitle     String?
  isActive     Boolean   @default(true)

  tenant       Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  licenses     License[]

  @@index([tenantId])
}

// ═══════════ أنواع التراخيص (كتالوج جاهز) ═══════════

model LicenseType {
  id                 String     @id @default(cuid())
  tenantId           String?                    // null = نوع عام يظهر لكل المستأجرين
  nameAr             String                     // "رخصة بلدية"
  nameEn             String?
  authority          String?                    // "وزارة الشؤون البلدية"
  holderType         HolderType
  defaultDurationMo  Int?                       // مدة الصلاحية الاعتيادية بالأشهر
  defaultCalendar    CalendarType @default(GREGORIAN)
  typicalPenaltyNote String?                    // "غرامة تبدأ من ٥٠٠٠ ريال" — يستخدم في التنبيه
  renewalUrl         String?
  sortOrder          Int        @default(0)

  licenses           License[]

  @@index([tenantId])
}

// ═══════════ الترخيص وفتراته ═══════════

model License {
  id            String        @id @default(cuid())
  tenantId      String
  licenseTypeId String
  facilityId    String?
  personId      String?

  number        String?                          // رقم الترخيص — ثابت عبر التجديدات
  label         String?                          // تسمية يختارها العميل
  notes         String?
  isArchived    Boolean       @default(false)

  // مشتقّة من الفترة الحالية — تُحدَّث ليليًا لتسريع القوائم
  status        LicenseStatus @default(ACTIVE)
  currentExpiry DateTime?

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  licenseType   LicenseType   @relation(fields: [licenseTypeId], references: [id])
  facility      Facility?     @relation(fields: [facilityId], references: [id])
  person        Person?       @relation(fields: [personId], references: [id])
  periods       LicensePeriod[]
  renewalReqs   RenewalRequest[]

  @@index([tenantId, status])
  @@index([tenantId, currentExpiry])            // الفهرس الأهم — عليه تعتمد لوحة القيادة
}

model LicensePeriod {
  id            String       @id @default(cuid())
  tenantId      String
  licenseId     String

  issueDate     DateTime?
  expiryDate    DateTime                        // ميلادي — المرجع لكل الحسابات
  expiryHijri   String?                         // "1448-03-15" للعرض
  sourceCalendar CalendarType @default(GREGORIAN)

  cost          Decimal?     @db.Decimal(12, 2)
  isCurrent     Boolean      @default(true)
  closedAt      DateTime?                       // متى استُبدلت بفترة أحدث

  createdAt     DateTime     @default(now())

  license       License      @relation(fields: [licenseId], references: [id], onDelete: Cascade)
  documents     Document[]
  reminders     ReminderJob[]

  @@index([tenantId, expiryDate])
  @@index([licenseId, isCurrent])
}

model Document {
  id         String        @id @default(cuid())
  tenantId   String
  periodId   String
  fileName   String
  storageKey String                              // مفتاح التخزين — لا ترفع الملفات لقاعدة البيانات
  mimeType   String
  sizeBytes  Int
  uploadedBy String?
  createdAt  DateTime      @default(now())

  period     LicensePeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

// ═══════════ محرك التنبيهات ═══════════

model ReminderRule {
  id         String          @id @default(cuid())
  tenantId   String
  offsetDays Int                                 // 60, 30, 7, 0, وسالب للمتأخرات
  channel    ReminderChannel
  isActive   Boolean         @default(true)

  tenant     Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, offsetDays, channel])
}

model ReminderJob {
  id          String         @id @default(cuid())
  tenantId    String
  periodId    String
  offsetDays  Int
  dueOn       DateTime                           // تاريخ الإرسال المخطط
  status      DeliveryStatus @default(SCHEDULED)
  createdAt   DateTime       @default(now())

  period      LicensePeriod  @relation(fields: [periodId], references: [id], onDelete: Cascade)
  deliveries  NotificationLog[]

  @@unique([periodId, offsetDays])               // ← يمنع الإرسال المكرر
  @@index([status, dueOn])
}

model NotificationLog {
  id          String         @id @default(cuid())
  tenantId    String
  reminderId  String
  channel     ReminderChannel
  recipient   String                             // الجوال أو البريد وقت الإرسال
  bodySnapshot String                            // نص الرسالة كما أُرسلت — لا يُعدَّل أبدًا
  status      DeliveryStatus
  providerRef String?                            // معرّف المزوّد لتتبع الفشل
  errorText   String?
  sentAt      DateTime       @default(now())

  reminder    ReminderJob    @relation(fields: [reminderId], references: [id], onDelete: Cascade)

  @@index([tenantId, sentAt])
}

// ═══════════ التجديد كمصدر عمولة ═══════════

model ServiceProvider {
  id            String           @id @default(cuid())
  name          String
  phone          String?
  specialties   String[]                          // أنواع التراخيص التي ينفذها
  commissionPct Decimal?         @db.Decimal(5, 2)
  isActive      Boolean          @default(true)

  requests      RenewalRequest[]
}

model RenewalRequest {
  id           String               @id @default(cuid())
  tenantId     String
  licenseId    String
  providerId   String?
  status       RenewalRequestStatus @default(NEW)
  quotedAmount Decimal?             @db.Decimal(12, 2)
  commission   Decimal?             @db.Decimal(12, 2)
  notes        String?
  createdAt    DateTime             @default(now())
  completedAt  DateTime?

  license      License              @relation(fields: [licenseId], references: [id])
  provider     ServiceProvider?     @relation(fields: [providerId], references: [id])

  @@index([tenantId, status])
}

// ═══════════ الاشتراك ═══════════

model Subscription {
  id            String   @id @default(cuid())
  tenantId      String   @unique
  plan          String                            // starter / business
  licenseQuota  Int      @default(25)
  startsOn      DateTime
  endsOn        DateTime
  amount        Decimal  @db.Decimal(12, 2)
  isActive      Boolean  @default(true)

  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

// ═══════════ سجل التدقيق ═══════════

model AuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  action     String                               // license.created, period.renewed...
  entityType String
  entityId   String
  diff       Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
}
```

---

## ٤. منطق محرك التنبيهات

مهمة مجدولة واحدة تعمل يوميًا الساعة ٧ صباحًا بتوقيت الرياض:

```
لكل فترة ترخيص حالية (isCurrent = true) وحالتها ليست CANCELLED:

  daysLeft = فرق الأيام بين expiryDate واليوم (بتوقيت الرياض، بداية اليوم)

  // ١. تحديث الحالة المخزَّنة
  إذا daysLeft <  0   → EXPIRED
  إذا daysLeft <= 60  → EXPIRING_SOON
  غير ذلك            → ACTIVE
  (لا تلمس UNDER_RENEWAL — يضبطها المستخدم يدويًا)

  // ٢. جدولة التنبيهات
  لكل قاعدة تنبيه مفعّلة في المستأجر:
    إذا daysLeft == offsetDays:
      أنشئ ReminderJob بمفتاح (periodId, offsetDays)
      إذا فشل الإنشاء بسبب القيد الفريد → تخطَّ بصمت (أُرسل سابقًا)

  // ٣. متابعة المتأخرات
  إذا daysLeft < 0 و (daysLeft % 7 == 0) و daysLeft > -90:
    أنشئ تنبيه متابعة بمفتاح offsetDays = daysLeft

ثم: أرسل كل ReminderJob حالته SCHEDULED و dueOn <= اليوم
     سجّل كل محاولة في NotificationLog حتى لو فشلت
```

**نقاط تنفيذية:**
- استخدم طابور مهام (BullMQ مع Redis) للإرسال، وليس حلقة داخل الـ cron — حتى لا يوقف فشل رسالة واحدة الباقي
- أعد المحاولة ٣ مرات بتباعد متزايد، ثم علّمها FAILED وأظهرها للمالك في اللوحة
- رسالة واتساب يجب أن تكون قالبًا معتمدًا مسبقًا من مزوّد الخدمة

---

## ٥. الشاشات

### أ. لوحة القيادة (الصفحة الرئيسية)
- أربع بطاقات علوية: **منتهي** (أحمر) · **خلال ٣٠ يومًا** (برتقالي) · **خلال ٦٠ يومًا** (أصفر) · **ساري** (أخضر)
- شريط زمني أفقي لـ ٩٠ يومًا القادمة، كل ترخيص نقطة عليه
- جدول "يحتاج انتباهك الآن" — مرتب تصاعديًا حسب تاريخ الانتهاء، أول ١٠ فقط
- تنبيه علوي إن فشل إرسال أي إشعار

### ب. قائمة التراخيص
- فلاتر: الفرع · النوع · الحالة · حامل الترخيص
- بحث بالرقم أو التسمية
- أعمدة: النوع، الرقم، الفرع/الشخص، تاريخ الانتهاء (ميلادي + هجري)، المتبقي بالأيام، الحالة
- إجراء سريع من الصف: **جدّد** · **اطلب تنفيذ التجديد**

### ج. صفحة الترخيص
ثلاثة تبويبات:
1. **البيانات** — الحقول + المرفق الحالي
2. **سجل الفترات** — كل تجديد سابق بتواريخه وتكلفته ومرفقه (هذا ما يبني قيمة تراكمية)
3. **سجل التنبيهات** — ماذا أُرسل، لمن، متى، وهل وصل

### د. إضافة / تجديد ترخيص
معالج من ثلاث خطوات: النوع (يملأ الافتراضيات تلقائيًا) → الحامل والتواريخ → المرفق.
عند التجديد: تُغلق الفترة الحالية (`isCurrent = false`, `closedAt`) وتُنشأ فترة جديدة — **لا يُعدَّل السجل القديم إطلاقًا**.

### هـ. الفروع والأشخاص
شاشتان بسيطتان، مع عرض التراخيص المرتبطة بكل سجل.

### و. الإعدادات
- مهل التنبيه (٦٠/٣٠/٧ قابلة للتعديل)
- مستقبلو التنبيه ووسائلهم
- إدارة المستخدمين والصلاحيات

### ز. الإدخال السريع (شاشة الترحيب)
جدول لصق مباشر: العميل يلصق بياناته من إكسل أو يدخل ٥ تراخيص في دقيقتين.
**هذه الشاشة تحدد نجاحك أو فشلك** — إن استغرق الإدخال نصف ساعة، لن يكمل العميل ولن يجدد اشتراكه.

---

## ٦. قبل أول عميل

- [ ] **مراجعة قانونية** لسياسة الخصوصية ومعالجة هوية/إقامة الموظفين — تقع تحت نظام حماية البيانات الشخصية
- [ ] **بند في الاتفاقية** ينص أن المسؤولية النهائية عن التجديد على العميل، وأن الخدمة مساعِدة لا ضامنة
- [ ] تشفير حقل `nationalId` في قاعدة البيانات
- [ ] نسخ احتياطي يومي مُختبَر فعليًا (جرّب الاستعادة مرة قبل الإطلاق)
- [ ] اعتماد قوالب واتساب لدى المزوّد — تستغرق أيامًا، ابدأها مبكرًا

---

## ٧. ترتيب البناء المقترح (أسبوعان)

| اليوم | العمل |
|---|---|
| ١–٢ | المخطط + الترحيل + كتالوج أنواع التراخيص + بذور تجريبية |
| ٣–٥ | واجهات CRUD: تراخيص، فروع، أشخاص، مرفقات |
| ٦–٧ | محرك التنبيهات + الطابور + سجل الإرسال |
| ٨–٩ | لوحة القيادة والقائمة والفلاتر |
| ١٠ | شاشة الإدخال السريع |
| ١١–١٢ | المصادقة والصلاحيات (منسوخة من مشروعك الحالي) |
| ١٣–١٤ | نشر + اختبار مع عميلين حقيقيين |
