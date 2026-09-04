// ══════════════════════════════════════════════════════════════
//  apps/web/lib/server/session.ts
//
//  الرموز تعيش في كعكات httpOnly، لا في localStorage: سكربت واحد
//  مُخترَق في الصفحة لا يستطيع قراءتها ولا سرقة جلسة العميل.
//
//  ولهذا أيضًا يمرّ كل نداء للـ API عبر بروكسي في Next بدل نداء
//  مباشر من المتصفح — وهو ما يجعل شاشة الإدخال السريع الجاهزة
//  تعمل كما هي: هي تنادي `/api/licenses/bulk` بلا ترويسة تفويض.
// ══════════════════════════════════════════════════════════════

import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'tk_at';
export const REFRESH_COOKIE = 'tk_rt';

export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000/api';

const isProd = process.env.NODE_ENV === 'production';

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

export async function readTokens() {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: jar.get(REFRESH_COOKIE)?.value ?? null,
  };
}

export async function writeTokens(accessToken: string, refreshToken: string, expiresIn: number) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: expiresIn });
  // ٣٠ يومًا — يطابق JWT_REFRESH_TTL الافتراضي في الخادم
  jar.set(REFRESH_COOKIE, refreshToken, { ...baseCookie, maxAge: 30 * 86_400 });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** نداء الخادم من مكوّن خادمي، بالرمز الحالي */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { accessToken } = await readTokens();

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
}
