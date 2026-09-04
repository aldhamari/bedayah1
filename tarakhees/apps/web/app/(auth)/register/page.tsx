'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral(null);

    const form = new FormData(e.currentTarget);
    const phone = String(form.get('phone') ?? '').trim();

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        fullName: form.get('fullName'),
        email: form.get('email'),
        password: form.get('password'),
        tenantName: form.get('tenantName'),
        crNumber: String(form.get('crNumber') ?? '').trim() || null,
        phone: phone || null,
      }),
    });

    if (res.ok) {
      router.push('/licenses/quick-entry');
      router.refresh();
      return;
    }

    const body = await res.json().catch(() => null);
    if (Array.isArray(body?.errors)) {
      setErrors(Object.fromEntries(body.errors.map((e: any) => [e.field, e.message])));
    } else {
      setGeneral(body?.message ?? 'تعذّر إنشاء الحساب');
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">سجّل منشأتك</h1>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            {general && <Alert>{general}</Alert>}

            <Field label="اسم المنشأة" error={errors.tenantName}>
              <Input name="tenantName" required placeholder="محامص وعطارة بداية" />
            </Field>

            <Field label="رقم السجل التجاري (اختياري)" error={errors.crNumber}>
              <Input name="crNumber" dir="ltr" inputMode="numeric" />
            </Field>

            <hr className="border-slate-200" />

            <Field label="اسمك الكامل" error={errors.fullName}>
              <Input name="fullName" required />
            </Field>

            <Field label="البريد الإلكتروني" error={errors.email}>
              <Input name="email" type="email" required dir="ltr" autoComplete="email" />
            </Field>

            <Field label="الجوال (اختياري)" error={errors.phone} hint="لتصلك التنبيهات على واتساب">
              <Input name="phone" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" />
            </Field>

            <Field
              label="كلمة المرور"
              error={errors.password}
              hint="عشر خانات على الأقل — عبارة طويلة أقوى من رموز قليلة"
            >
              <Input name="password" type="password" required autoComplete="new-password" />
            </Field>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'جارٍ الإنشاء…' : 'أنشئ الحساب'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-600">
          لديك حساب؟{' '}
          <Link href="/login" className="font-medium text-slate-900 underline">
            سجّل الدخول
          </Link>
        </p>
      </div>
    </main>
  );
}
