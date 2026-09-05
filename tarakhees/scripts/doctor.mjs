#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  scripts/doctor.mjs
//
//  يفحص كل ما يلزم للتشغيل المحلي ويقول أين تعثّر بالضبط وكيف يُصلَح.
//  التشغيل:  npm run doctor
//
//  لا يُعدّل شيئًا — قراءة وفحص فقط.
//  كل فحص داخل try/catch: عطل واحد لا يُسقط التقرير كله.
// ══════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
let blocking = 0;

const add = (ok, label, detail = '', fix = '') => {
  rows.push({ ok, label, detail, fix });
  if (ok === false) blocking++;
};

// على ويندوز `npm` ملف npm.cmd لا تنفيذي، و spawnSync بلا shell لا يجده
// فيرجع ENOENT ويبدو الأمر كأنه غير مثبَّت. shell:true يحلّها هناك وحدها.
const isWindows = process.platform === 'win32';

const run = (cmd, args) => {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000, shell: isWindows });
    return r.status === 0 ? (r.stdout || '').trim() : null;
  } catch {
    return null;
  }
};

const portOpen = (port, host = '127.0.0.1') =>
  new Promise((done) => {
    const s = createConnection({ port, host });
    const finish = (v) => { s.destroy(); done(v); };
    s.setTimeout(1500);
    s.on('connect', () => finish(true));
    s.on('timeout', () => finish(false));
    s.on('error', () => finish(false));
  });

// ─────────────── ١. البيئة ───────────────

const nodeMajor = Number(process.versions.node.split('.')[0]);
add(nodeMajor >= 20, `Node.js ${process.versions.node}`,
  nodeMajor >= 20 ? '' : 'المطلوب ٢٠ فأعلى',
  'حدّث Node من nodejs.org أو عبر nvm');

const npmV = run('npm', ['-v']);
add(!!npmV, `npm ${npmV ?? '—'}`, npmV ? '' : 'npm غير موجود في PATH');

const dockerV = run('docker', ['compose', 'version']);
add(dockerV !== null, 'Docker Compose', dockerV ? dockerV.split('\n')[0] : 'غير متاح',
  'ثبّت Docker Desktop، أو شغّل Postgres و Redis محليًا وعدّل .env');

// ─────────────── ٢. ملف البيئة ───────────────

const envPath = resolve(root, '.env');
const hasEnv = existsSync(envPath);
add(hasEnv, '.env موجود', hasEnv ? '' : 'مفقود', 'npm run env:init');

let env = {};
if (hasEnv) {
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  } catch { /* يُبلَّغ عنه أدناه */ }

  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'FIELD_ENCRYPTION_KEY'];
  const missing = required.filter((k) => !env[k] || env[k].includes('CHANGE_ME'));
  add(missing.length === 0, 'أسرار .env مضبوطة',
    missing.length ? `ناقص أو CHANGE_ME: ${missing.join('، ')}` : '',
    'احذف .env ثم npm run env:init');

  if (env.FIELD_ENCRYPTION_KEY && !env.FIELD_ENCRYPTION_KEY.includes('CHANGE_ME')) {
    let bytes = 0;
    try { bytes = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64').length; } catch { /* 0 */ }
    add(bytes === 32, 'FIELD_ENCRYPTION_KEY بطول ٣٢ بايت',
      bytes === 32 ? '' : `الطول ${bytes} بايت — AES-256 يحتاج ٣٢ بالضبط`,
      'احذف .env ثم npm run env:init');
  }

  if (env.DATABASE_URL) {
    const bad = /[^\x00-\x7F]/.test(env.DATABASE_URL);
    add(!bad, 'DATABASE_URL بمحارف لاتينية',
      bad ? 'فيه محارف غير لاتينية تحتاج ترميز نسبة مئوية' : '',
      'استخدم كلمة مرور لاتينية، أو npm run env:init');
  }
}

// ─────────────── ٣. التثبيت والبناء ───────────────

add(existsSync(resolve(root, 'node_modules')), 'npm install تم', '', 'npm install');

const sharedDist = resolve(root, 'packages/shared/dist/index.js');
add(existsSync(sharedDist), 'الحزمة المشتركة مبنيّة',
  existsSync(sharedDist) ? '' : 'packages/shared/dist مفقود — الـAPI والواجهة لن يقلعا',
  'npm install   (يبنيها postinstall)');

const prismaClient = resolve(root, 'node_modules/.prisma/client/index.js');
const prismaAlt = resolve(root, 'node_modules/@prisma/client/index.js');
add(existsSync(prismaClient) || existsSync(prismaAlt), 'عميل Prisma مولَّد', '',
  'npm run prisma:generate');

// ─────────────── ٤. الخدمات ───────────────

const pgPort = Number(env.POSTGRES_PORT || 5432);
const redisPort = Number(env.REDIS_PORT || 6379);

const pgUp = await portOpen(pgPort);
add(pgUp, `PostgreSQL يستمع على ${pgPort}`, pgUp ? '' : 'لا اتصال',
  'npm run db:up   — أو ثبّت PostgreSQL مباشرة (راجع install-windows-no-docker.md)');

const redisUp = await portOpen(redisPort);
add(redisUp, `Redis يستمع على ${redisPort}`, redisUp ? '' : 'لا اتصال',
  'npm run db:up   — أو ثبّت Memurai مباشرة (راجع install-windows-no-docker.md)');

// ─────────────── ٥. قاعدة البيانات ───────────────

if (pgUp && env.DATABASE_URL) {
  try {
    process.env.DATABASE_URL = env.DATABASE_URL;
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const applied = await prisma.$queryRawUnsafe(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at',
      );
      const names = applied.map((r) => r.migration_name);
      const hasBase = names.some((n) => n.includes('add_license_module'));
      const hasHard = names.some((n) => n.includes('license_module_hardening'));

      add(hasBase && hasHard, `الترحيلات مطبَّقة (${names.length})`,
        hasBase && hasHard ? '' : `ناقص: ${!hasBase ? 'add_license_module ' : ''}${!hasHard ? 'license_module_hardening' : ''}`,
        'npm run prisma:migrate');

      const types = await prisma.licenseType.count();
      add(types >= 27, `كتالوج أنواع التراخيص (${types})`,
        types >= 27 ? '' : 'البذور لم تُشغَّل', 'npm run prisma:seed');

      const tenants = await prisma.tenant.count();
      rows.push({ ok: null, label: `منشآت مسجّلة: ${tenants}`,
        detail: tenants === 0 ? 'سجّل واحدة من /register' : '', fix: '' });
    } catch (e) {
      add(false, 'الاتصال بقاعدة البيانات',
        String(e.message).split('\n')[0].slice(0, 120),
        'تأكد أن DATABASE_URL يطابق ما في docker-compose، ثم npm run prisma:migrate');
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (e) {
    add(false, 'تحميل عميل Prisma', String(e.message).slice(0, 120), 'npm run prisma:generate');
  }
}

// ─────────────── ٦. الخادمان ───────────────

const apiPort = Number(env.API_PORT || 4000);
const webPort = Number(env.WEB_PORT || 3000);
for (const [port, name, cmd] of [[apiPort, 'الـAPI', 'npm run dev:api'], [webPort, 'الواجهة', 'npm run dev:web']]) {
  const up = await portOpen(port);
  rows.push({ ok: null, label: `${name} على ${port}`,
    detail: up ? 'يعمل' : 'متوقف', fix: up ? '' : cmd });
}

// ─────────────── التقرير ───────────────

const W = 42;
console.log('\n' + '═'.repeat(60));
console.log('  تشخيص نظام متابعة التراخيص');
console.log('═'.repeat(60) + '\n');

for (const r of rows) {
  const mark = r.ok === true ? '✅' : r.ok === false ? '❌' : '•';
  console.log(`${mark} ${r.label.padEnd(W)} ${r.detail}`);
  if (r.ok === false && r.fix) console.log(`   └─ الحل: ${r.fix}`);
}

console.log('\n' + '─'.repeat(60));
if (blocking === 0) {
  console.log('كل الفحوص الأساسية سليمة.');
  console.log('إن بقيت المشكلة، شغّل الخادم وانسخ الخطأ كاملًا:');
  console.log('  npm run dev:api');
} else {
  console.log(`${blocking} عائقًا يمنع التشغيل. أصلحها بالترتيب أعلاه.`);
}
console.log('─'.repeat(60) + '\n');

process.exit(0);
