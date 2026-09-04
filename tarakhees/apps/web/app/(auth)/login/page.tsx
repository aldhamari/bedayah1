'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: form.get('email'),
        password: form.get('password'),
      }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
      return;
    }

    const body = await res.json().catch(() => null);
    setError(body?.errors?.[0]?.message ?? body?.message ?? 'تعذّر تسجيل الدخول');
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-2xl font-semibold text-slate-900">
          متابعة التراخيص والتجديدات
        </h1>
        <p className="mb-6 text-center text-sm text-slate-600">
          غرامة واحدة تساوي اشتراك خمس سنوات.
        </p>

        <Card>
          <form onSubmit={submit} className="space-y-4">
            {error && <Alert>{error}</Alert>}

            <Field label="البريد الإلكتروني">
              <Input name="email" type="email" required autoComplete="email" dir="ltr" />
            </Field>

            <Field label="كلمة المرور">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-600">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="font-medium text-slate-900 underline">
            سجّل منشأتك
          </Link>
        </p>
      </div>
    </main>
  );
}
