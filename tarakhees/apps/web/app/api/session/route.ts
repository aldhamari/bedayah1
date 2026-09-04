// ══════════════════════════════════════════════════════════════
//  apps/web/app/api/session/route.ts
//
//  الدخول والتسجيل والخروج — هنا وحده تُكتب كعكات الجلسة.
//  مسار أدقّ من [...path] فيسبقه في التوجيه.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { API_URL, clearTokens, readTokens, writeTokens } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  const { action, ...payload } = await req.json();
  const path = action === 'register' ? '/auth/register' : '/auth/login';

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) return NextResponse.json(data ?? { message: 'تعذّر الاتصال' }, { status: res.status });

  await writeTokens(data.accessToken, data.refreshToken, data.expiresIn);
  return NextResponse.json({ user: data.user });
}

export async function DELETE() {
  const { refreshToken } = await readTokens();

  // نُبطل الجلسة في الخادم أيضًا، لا نكتفي بحذف الكعكة محليًا
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await clearTokens();
  return NextResponse.json({ ok: true });
}
