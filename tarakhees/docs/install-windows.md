# التثبيت على ويندوز — من الصفر

دليل لمن لم يثبّت شيئًا بعد. كل أمر أدناه يُنسخ ويُلصق كما هو.

---

## ١. افتح PowerShell

اضغط **مفتاح ويندوز**، اكتب `powershell`، ثم اضغط Enter.

ستظهر نافذة زرقاء أو سوداء. هذه هي «الطرفية» — كل الأوامر تُكتب فيها.

> **نافذة عادية تكفي.** لا تحتاج «تشغيل كمسؤول» إلا حيث أذكر ذلك صراحةً.

---

## ٢. اعرف ما ينقصك

الصق هذا كاملًا واضغط Enter:

```powershell
foreach ($t in @(
  @{n='Git';    c='git --version'},
  @{n='Node.js';c='node -v'},
  @{n='npm';    c='npm -v'},
  @{n='Docker'; c='docker --version'}
)) {
  $v = cmd /c "$($t.c)" 2>$null
  if ($v) { Write-Host ("[موجود] {0,-8} {1}" -f $t.n, $v) -ForegroundColor Green }
  else    { Write-Host ("[ناقص ] {0}" -f $t.n) -ForegroundColor Red }
}
```

ثبّت ما ظهر **[ناقص]** فقط، من الخطوة التالية.

---

## ٣. ثبّت الناقص

ويندوز ١٠ (تحديث ٢٠٠٤ فأحدث) و١١ فيهما `winget` جاهزًا.

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
winget install --id Docker.DockerDesktop -e --source winget
```

**بعد التثبيت: أغلق نافذة PowerShell وافتح واحدة جديدة.** الأوامر الجديدة
لا تظهر في نافذة كانت مفتوحة قبلها — وهذا أشهر سبب لظن أن التثبيت فشل.

ثم أعد أمر الفحص في الخطوة ٢ للتأكد أن الأربعة صاروا **[موجود]**.

> **لا يعمل `winget` عندك؟** حمّل المثبّتات مباشرة:
> [Git](https://git-scm.com/download/win) ·
> [Node.js LTS](https://nodejs.org/) ·
> [Docker Desktop](https://www.docker.com/products/docker-desktop/)

---

## ٤. شغّل Docker Desktop

**التثبيت وحده لا يكفي — يجب أن يكون البرنامج شغّالًا.**

افتح **Docker Desktop** من قائمة ابدأ، وانتظر حتى تتحول أيقونة الحوت في
شريط المهام إلى الحالة الخضراء (قد تستغرق دقيقة في أول مرة).

للتأكد:

```powershell
docker ps
```

- ظهر جدول فارغ برؤوس أعمدة ← ممتاز.
- ظهر `error during connect` ← Docker Desktop ليس شغّالًا بعد. انتظر أو أعد فتحه.

> **طلب تفعيل WSL 2؟** وافق واتبع ما يعرضه، ثم أعد تشغيل الجهاز.
> Docker على ويندوز يحتاجه.

> ### فشل مثبّت Docker بـ `Installer failed with exit code: 1`؟
>
> السبب شبه المؤكد أن **WSL 2** أو **المحاكاة الافتراضية** غير مفعّلين.
> جرّب مرة واحدة فقط: افتح PowerShell **كمسؤول** ← `wsl --install` ←
> أعد تشغيل الجهاز ← أعد أمر التثبيت.
>
> **وإن فشل ثانيةً فلا تكرّره.** Docker عندنا لا يشغّل إلا PostgreSQL
> و Redis، وكلاهما يُثبَّت مباشرة على ويندوز بلا WSL ولا BIOS:
> **[`docs/install-windows-no-docker.md`](./install-windows-no-docker.md)**

---

## ٥. أنزل المشروع

اختر مجلدًا **قصير المسار وبلا مسافات ولا حروف عربية** — تجنّب سطح المكتب
وOneDrive، فهما يسبّبان مشاكل مع `node_modules`:

```powershell
mkdir C:\dev -Force
cd C:\dev

git clone <رابط-المستودع> bedayah1
cd bedayah1
git checkout claude/tarakhees-initial-setup-rgid2s
cd tarakhees
```

ضع رابط مستودعك مكان `<رابط-المستودع>`. لو طلب منك اسم مستخدم وكلمة مرور،
استخدم اسم مستخدم GitHub و**Personal Access Token** بدل كلمة المرور.

للتأكد أنك في المكان الصحيح:

```powershell
dir package.json
```

يجب أن يظهر الملف. إن لم يظهر فأنت في مجلد خاطئ.

---

## ٦. أزل حاجز PowerShell قبل npm

هذه الخطوة **مهمة على ويندوز تحديدًا**. بدونها سيظهر لك:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because
running scripts is disabled on this system.
```

الحل — مرة واحدة على الجهاز:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

اكتب `Y` واضغط Enter. هذا يسمح بتشغيل السكربتات المثبَّتة محليًا، ولا
يخفّض أمان جهازك أمام سكربتات الإنترنت.

---

## ٧. ثبّت وشغّل

```powershell
npm install
```

يستغرق ٣–٧ دقائق في أول مرة. سيبني الحزمة المشتركة ويولّد عميل قاعدة
البيانات تلقائيًا في نهايته.

```powershell
npm run setup
```

هذا يُنشئ ملف الإعدادات بأسرار عشوائية، يرفع قاعدة البيانات و Redis في
Docker، يطبّق الترحيلين، ويزرع ٢٧ نوع ترخيص سعودي.

ثم **افتح نافذتَي PowerShell** (لا واحدة)، وفي كل واحدة `cd C:\dev\bedayah1\tarakhees`:

| النافذة الأولى | النافذة الثانية |
|---|---|
| `npm run dev:api` | `npm run dev:web` |

انتظر حتى تظهر في الثانية `Ready in ...`، ثم افتح:

### <http://localhost:3000>

---

## ٨. تعثّرت؟

```powershell
npm run doctor
```

يفحص كل شيء ويطبع بجانب كل عطل أمر إصلاحه.

### أعطال ويندوز الشائعة

**`npm : File ... npm.ps1 cannot be loaded`**
الخطوة ٦ لم تُنفَّذ. نفّذها ثم أعد المحاولة.

**`git` أو `node` غير معروف رغم أنك ثبّتّه**
أغلق PowerShell وافتح نافذة جديدة. إن استمر، أعد تشغيل الجهاز.

**`error during connect` أو `docker daemon is not running`**
افتح Docker Desktop وانتظر الأيقونة الخضراء.

**`port is already allocated` عند `npm run setup`**
برنامج آخر يستعمل المنفذ ٥٤٣٢ أو ٦٣٧٩ (غالبًا PostgreSQL مثبَّت سابقًا).
افتح `.env` بالمفكرة، غيّر `POSTGRES_PORT` إلى `5433`، **وغيّر المنفذ داخل
`DATABASE_URL` في نفس الملف إلى ٥٤٣٣ أيضًا**، ثم `npm run setup` من جديد.

**`EPERM` أو `operation not permitted` أثناء `npm install`**
مضاد الفيروسات يحجب. استثنِ المجلد `C:\dev`، أو انقل المشروع خارج
OneDrive إن كان بداخله.

**الصفحة لا تفتح على localhost:3000**
تأكد أن نافذة `npm run dev:web` ما زالت مفتوحة وفيها `Ready`. إغلاق
النافذة يوقف الخادم.

---

## أول خمس دقائق بعد أن تفتح الصفحة

راجع [`docs/running.md`](./running.md) — فيه بيانات جاهزة للصق تملأ لوحة
القيادة فورًا بدل أن تبدأ فارغة.
