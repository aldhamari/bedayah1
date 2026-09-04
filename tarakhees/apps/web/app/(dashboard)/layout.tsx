// ══════════════════════════════════════════════════════════════
//  apps/web/app/(dashboard)/layout.tsx
//
//  الهيكل المشترك لكل الشاشات المحمية. مكوّن خادمي: يتحقق من
//  الجلسة قبل إرسال أي بايت، فلا تومض شاشة ثم تُعيد التوجيه.
// ══════════════════════════════════════════════════════════════

import { redirect } from 'next/navigation';
import type { SessionUser } from '@repo/shared/auth/auth.schema';
import { apiFetch, readTokens } from '@/lib/server/session';
import { AppNav } from '@/components/AppNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { accessToken, refreshToken } = await readTokens();
  if (!accessToken && !refreshToken) redirect('/login');

  const res = await apiFetch('/auth/me');
  if (!res.ok) redirect('/login');

  const user: SessionUser = await res.json();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav user={user} />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
