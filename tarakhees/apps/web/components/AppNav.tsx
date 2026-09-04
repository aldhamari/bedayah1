'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SessionUser } from '@repo/shared/auth/auth.schema';
import { ROLE_LABEL } from '@/lib/format';

const LINKS = [
  { href: '/', label: 'لوحة القيادة' },
  { href: '/licenses', label: 'التراخيص' },
  { href: '/licenses/quick-entry', label: 'إدخال سريع' },
  { href: '/facilities', label: 'الفروع' },
  { href: '/persons', label: 'الأشخاص' },
  { href: '/settings', label: 'الإعدادات' },
];

export function AppNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  async function logout() {
    await fetch('/api/session', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="text-base font-semibold text-slate-900">
          متابعة التراخيص
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="main-nav"
          className="ms-auto rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 sm:hidden"
        >
          القائمة
        </button>

        <nav
          id="main-nav"
          className={`${open ? 'flex' : 'hidden'} w-full flex-col gap-1 sm:flex sm:w-auto sm:flex-row sm:gap-1`}
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                isActive(link.href)
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:ms-auto">
          <div className="text-end leading-tight">
            <div className="text-sm font-medium text-slate-800">{user.tenantName}</div>
            <div className="text-xs text-slate-500">
              {user.fullName} · {ROLE_LABEL[user.role] ?? user.role}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            خروج
          </button>
        </div>
      </div>
    </header>
  );
}
