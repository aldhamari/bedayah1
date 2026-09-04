'use client';

// ══════════════════════════════════════════════════════════════
//  قبول الدعوة — صفحة مفتوحة، تُفتح من الرابط الذي يرسله المالك.
// ══════════════════════════════════════════════════════════════

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui';

function AcceptInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/accept-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        fullName: String(form.get('fullName') ?? '').trim() || null,
        password: String(form.get('password') ?? '').trim() || null,
      }),
    });

    if (res.ok) {
      // الرد يحمل رموزًا، لكن الكعكات تُكتب في مسار الجلسة وحده،
      // فنوجّه المستخدم إلى الدخول بحسابه الجديد.
      router.push('/login');
      return;
    }

    const body = await res.json().catch(() => null);
    setError(body?.errors?.[0]?.message ?? body?.message ?? 'تعذّر قبول الدعوة');
    setBusy(false);
  }

  if (!token) {
    return (
      <Card>
        <Alert>الرابط ناقص — اطلب من صاحب المنشأة إرسال دعوة جديدة.</Alert>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">انضم إلى المنشأة</h1>
      <p className="mb-5 text-sm text-slate-600">
        إن كان لك حساب بالفعل، اترك الحقلين فارغين واضغط انضمام.
      </p>

      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="اسمك الكامل" hint="مطلوب إن لم يكن لك حساب بعد">
          <Input name="fullName" />
        </Field>

        <Field label="كلمة المرور" hint="عشر خانات على الأقل — مطلوبة للحساب الجديد">
          <Input name="password" type="password" autoComplete="new-password" />
        </Field>

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'جارٍ الانضمام…' : 'انضم'}
        </Button>
      </form>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<Spinner />}>
          <AcceptInner />
        </Suspense>
      </div>
    </main>
  );
}
