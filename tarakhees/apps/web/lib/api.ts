'use client';

// ══════════════════════════════════════════════════════════════
//  apps/web/lib/api.ts
//
//  نداءات العميل تمرّ كلها بالبروكسي في `/api/*` — لا رمز في
//  المتصفح، والتدوير يحدث في الخادم دون أن يشعر المستخدم.
// ══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // 422 من Zod يحمل أخطاء الحقول — تعرضها النماذج بجانب كل حقل
    const fields = Array.isArray(body?.errors) ? body.errors : undefined;
    const message =
      fields?.[0]?.message ??
      (typeof body?.message === 'string' ? body.message : null) ??
      (res.status === 401 ? 'انتهت الجلسة — سجّل الدخول من جديد' : 'حدث خطأ غير متوقع');

    throw new ApiError(message, res.status, fields);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * جلب بسيط بإعادة تحميل يدوية. لا نُدخل مكتبة حالة كاملة لست شاشات
 * — الحاجة الفعلية هنا: بيانات، خطأ، وإعادة تحميل بعد كل إجراء.
 */
export function useApi<T>(path: string | null): State<T> & { reload: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    api
      .get<T>(path)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: ApiError) =>
        !cancelled && setState({ data: null, error: e.message, loading: false }),
      );

    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
