// ══════════════════════════════════════════════════════════════
//  apps/web/app/api/[...path]/route.ts
//
//  بروكسي يمرّر كل نداء إلى خادم NestJS ويُلحق رمز الوصول من
//  الكعكة. عند 401 يجرّب التدوير مرة واحدة ثم يعيد المحاولة —
//  فلا ينقطع عمل المستخدم كل ربع ساعة.
// ══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { API_URL, readTokens, writeTokens, clearTokens } from '@/lib/server/session';

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();

  const send = (token: string | null) =>
    fetch(target, {
      method: req.method,
      headers: {
        'content-type': req.headers.get('content-type') ?? 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
      cache: 'no-store',
    });

  const { accessToken, refreshToken } = await readTokens();
  let upstream = await send(accessToken);

  // انتهت صلاحية رمز الوصول؟ دوّر مرة واحدة فقط — التدوير المتكرر
  // على نفس الطلب يعني مشكلة أعمق من انتهاء المهلة.
  if (upstream.status === 401 && refreshToken) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (refreshed.ok) {
      const data = await refreshed.json();
      await writeTokens(data.accessToken, data.refreshToken, data.expiresIn);
      upstream = await send(data.accessToken);
    } else {
      // الجلسة انتهت فعلًا (أو كُشفت إعادة استعمال) — نظّف الكعكات
      await clearTokens();
    }
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
