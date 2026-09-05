# التشغيل على ويندوز بلا Docker

Docker Desktop يحتاج **WSL 2** و**المحاكاة الافتراضية** — وكلاهما قد لا
يعمل على كل جهاز. وفشل مثبّته بـ `exit code 1` غالبًا سببه أحدهما.

لكن Docker عندنا لا يشغّل إلا شيئين: **PostgreSQL** و**Redis**. وكلاهما
يُثبَّت مباشرة على ويندوز، بلا WSL ولا تعديل BIOS.

> هذا المسار لا يغيّر سطرًا واحدًا من كود المشروع. الفرق الوحيد أنك
> تشغّل `npm run setup:local` بدل `npm run setup`.

---

## ١. PostgreSQL 16

```powershell
winget install --id PostgreSQL.PostgreSQL.16 -e --accept-source-agreements --accept-package-agreements
```

> لو لم يجد winget الحزمة، حمّل المثبّت من
> <https://www.postgresql.org/download/windows/> واختر الإصدار 16.

أثناء التثبيت:

- **سيطلب كلمة مرور للمستخدم `postgres`** — اكتب واحدة **واحفظها**،
  ستحتاجها بعد قليل. اجعلها بحروف وأرقام إنجليزية فقط.
- **المنفذ**: اتركه `5432`.
- بقية الخيارات: التالي، التالي.
- **Stack Builder** في النهاية: أغلقه، لا تحتاجه.

للتأكد بعد التثبيت (نافذة PowerShell جديدة):

```powershell
Get-Service postgresql*
```

يجب أن تظهر الخدمة بحالة **Running**.

---

## ٢. Redis — عبر Memurai

Redis نفسه لا يعمل على ويندوز مباشرة. **Memurai** نسخة متوافقة معه
مبنيّة لويندوز، ونسخة المطوّرين مجانية وتكفينا تمامًا:

```powershell
winget install --id Memurai.MemuraiDeveloper -e --accept-source-agreements --accept-package-agreements
```

> لو لم يجدها winget، حمّلها من <https://www.memurai.com/get-memurai>
> واختر **Developer Edition** (مجانية).

تعمل كخدمة ويندوز تلقائيًا على المنفذ `6379` — نفس منفذ Redis، فلا
يحتاج المشروع أي تعديل.

للتأكد:

```powershell
Get-Service memurai*
```

---

## ٣. أنشئ قاعدة البيانات والمستخدم

أنشئ ملف الإعدادات أولًا (يولّد كلمة مرور عشوائية سنستعملها):

```powershell
cd C:\dev\bedayah1\tarakhees
npm run env:init
```

اقرأ كلمة المرور التي وُلّدت:

```powershell
Select-String -Path .env -Pattern '^POSTGRES_PASSWORD='
```

انسخ القيمة بعد `=` (بلا مسافات)، ثم أنشئ المستخدم والقاعدة بها —
**ضع كلمة المرور المنسوخة مكان `PASTE_HERE`**:

```powershell
$pg = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $pg -U postgres -c "CREATE USER tarakhees WITH PASSWORD 'PASTE_HERE';"
& $pg -U postgres -c "CREATE DATABASE tarakhees OWNER tarakhees;"
```

سيطلب **كلمة مرور `postgres`** التي وضعتها في الخطوة ١ (مرة لكل أمر).

> لماذا هكذا؟ لأن `.env` يحمل كلمة مرور مولَّدة عشوائيًا، فنُنشئ
> المستخدم بها بدل تعديل الملف — فيبقى `DATABASE_URL` صحيحًا كما هو.

---

## ٤. هيّئ وشغّل

```powershell
npm install
npm run setup:local
```

`setup:local` مثل `setup` تمامًا لكن بلا `docker compose` — يطبّق
الترحيلين ويزرع أنواع التراخيص على القاعدة التي أنشأتها للتوّ.

ثم في **نافذتَي PowerShell**، وفي كل واحدة `cd C:\dev\bedayah1\tarakhees`:

| الأولى | الثانية |
|---|---|
| `npm run dev:api` | `npm run dev:web` |

افتح <http://localhost:3000>.

---

## ٥. تأكّد

```powershell
npm run doctor
```

المطلوب أن تظهر **PostgreSQL يستمع على 5432** و**Redis يستمع على 6379**
باللون الأخضر — الأداة تفحص المنفذ لا Docker، فلا يفرق عندها مصدر الخدمة.

---

## أعطال هذا المسار

**`psql` غير معروف**
استعمل المسار الكامل كما في الأوامر أعلاه (`& $pg`)، أو أضف
`C:\Program Files\PostgreSQL\16\bin` إلى PATH.

**`password authentication failed for user "tarakhees"`**
كلمة المرور التي ألصقتها في `CREATE USER` لا تطابق ما في `.env`.
احذف المستخدم وأعد إنشاءه بالقيمة الصحيحة:
```powershell
& $pg -U postgres -c "DROP DATABASE IF EXISTS tarakhees;"
& $pg -U postgres -c "DROP USER IF EXISTS tarakhees;"
```
ثم أعد الخطوة ٣.

**`database "tarakhees" already exists`**
موجودة من محاولة سابقة — تجاوز الأمر وأكمل.

**المنفذ 5432 مشغول**
PostgreSQL آخر مثبَّت سابقًا. إما تستعمله (وتضبط `DATABASE_URL` عليه)،
أو تغيّر `POSTGRES_PORT` **والمنفذ داخل `DATABASE_URL`** إلى 5433.

---

## هل تريد العودة إلى Docker لاحقًا؟

لا شيء يمنع. أوقف الخدمتين ثم استعمل `npm run setup` المعتاد:

```powershell
Stop-Service postgresql*, memurai*
```

ولمنعهما من العمل تلقائيًا عند الإقلاع:

```powershell
Set-Service postgresql-x64-16 -StartupType Manual
```
