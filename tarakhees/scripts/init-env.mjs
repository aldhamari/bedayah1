#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
//  scripts/init-env.mjs
//
//  يُنشئ .env من .env.example ويولّد الأسرار الحقيقية.
//  بـ Node لا بـ bash: يعمل على ويندوز وماك ولينكس بلا openssl.
//
//  آمن للتكرار: إن وُجد .env لم يُمسّ إطلاقًا — الأسرار الموجودة
//  تُشفَّر بها بيانات محفوظة، وتوليد مفتاح جديد فوقها يعني فقدانها.
// ══════════════════════════════════════════════════════════════

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

if (existsSync(envPath)) {
  console.log('✓ .env موجود — لم يُمسّ.');
  console.log('  (لتوليد أسرار جديدة: احذفه أولًا — وانتبه أن مفتاح التشفير');
  console.log('   الحالي هو الوحيد الذي يفكّ أرقام الهوية المحفوظة.)');
  process.exit(0);
}

if (!existsSync(examplePath)) {
  console.error('✗ .env.example غير موجود. أأنت في جذر المشروع؟');
  process.exit(1);
}

copyFileSync(examplePath, envPath);

const secret = () => randomBytes(32).toString('base64url');
const key32 = () => randomBytes(32).toString('base64'); // AES-256 يحتاج ٣٢ بايت بالضبط
const dbPassword = randomBytes(18).toString('base64url'); // آمن داخل رابط بلا ترميز

const values = {
  POSTGRES_PASSWORD: dbPassword,
  DATABASE_URL: `"postgresql://tarakhees:${dbPassword}@localhost:5432/tarakhees?schema=public"`,
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  FIELD_ENCRYPTION_KEY: key32(),
};

let text = readFileSync(envPath, 'utf8');
for (const [name, value] of Object.entries(values)) {
  text = text.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
}
writeFileSync(envPath, text);

console.log('✓ أُنشئ .env بأسرار مولَّدة عشوائيًا:');
console.log('    POSTGRES_PASSWORD · DATABASE_URL');
console.log('    JWT_ACCESS_SECRET · JWT_REFRESH_SECRET');
console.log('    FIELD_ENCRYPTION_KEY');
console.log('');
console.log('⚠️  FIELD_ENCRYPTION_KEY هو المفتاح الوحيد الذي يفكّ أرقام الهوية.');
console.log('    احفظ نسخة منه في مكان منفصل عن قاعدة البيانات — فقدانه يعني');
console.log('    فقدانها كلها. و .env مُستثنى من git فلن يُرفع.');
