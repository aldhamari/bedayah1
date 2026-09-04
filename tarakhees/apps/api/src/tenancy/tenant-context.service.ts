// ══════════════════════════════════════════════════════════════
//  apps/api/src/tenancy/tenant-context.service.ts
//
//  سياق المستأجر للطلب الجاري، محفوظ في AsyncLocalStorage.
//
//  لماذا ALS وليس حقنًا بالمُنشئ؟ لأن الملفات الجاهزة (المجدول،
//  المعالج، خدمة الاستيراد) تحقن `PrismaService` مباشرة. لو جعلنا
//  العزل يعتمد على تمرير المستأجر يدويًا لعاد الأمر إلى «تذكّر
//  المطوّر» — وهو بالضبط ما تمنعه القاعدة في CLAUDE.md.
// ══════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';

export type TenantStore = {
  /** null قبل المصادقة، ويملؤه JwtAuthGuard بعد التحقق */
  tenantId: string | null;
  userId: string | null;
  role: MemberRole | null;
  isSuperAdmin: boolean;
  /** عمق تداخل runAsSystem — عدّاد لا راية، حتى لا يُطفئه استدعاء متداخل */
  systemDepth: number;
};

/**
 * ما الذي يجب أن يفعله امتداد Prisma في اللحظة الحالية:
 *  - `system`  : بلا حصر (المجدول، المعالج، البذور، التسجيل)
 *  - `tenant`  : احقن tenantId
 *  - `blocked` : طلب HTTP لم تُثبت هويته بعد — ارفض كل جدول مملوك لمستأجر
 */
export type TenantScope =
  | { mode: 'system' }
  | { mode: 'tenant'; tenantId: string }
  | { mode: 'blocked' };

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  /** يفتح سياقًا فارغًا لطلب HTTP. يستدعيه TenantContextMiddleware. */
  runForRequest<T>(fn: () => T): T {
    const store: TenantStore = {
      tenantId: null,
      userId: null,
      role: null,
      isSuperAdmin: false,
      systemDepth: 0,
    };
    return this.als.run(store, fn);
  }

  /**
   * تعطيل العزل داخل نطاق محدود ومقصود: التسجيل (لا مستأجر بعد)،
   * قبول الدعوة، والتحقق من العضوية داخل الحارس نفسه.
   * استعمِله بأضيق نطاق ممكن، ولا تلفّ به معالج طلب كاملًا.
   */
  async runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
    const store = this.als.getStore();
    if (!store) return fn(); // خارج HTTP أصلًا — النظام هو السياق

    store.systemDepth += 1;
    try {
      return await fn();
    } finally {
      store.systemDepth -= 1;
    }
  }

  /** يملؤه الحارس بعد التحقق من الرمز والعضوية */
  authenticate(input: {
    userId: string;
    tenantId: string;
    role: MemberRole;
    isSuperAdmin: boolean;
  }): void {
    const store = this.als.getStore();
    if (!store) return;
    store.userId = input.userId;
    store.tenantId = input.tenantId;
    store.role = input.role;
    store.isSuperAdmin = input.isSuperAdmin;
  }

  get store(): TenantStore | undefined {
    return this.als.getStore();
  }

  get tenantId(): string | null {
    return this.als.getStore()?.tenantId ?? null;
  }

  /** القرار الذي يبني عليه امتداد Prisma */
  scope(): TenantScope {
    const store = this.als.getStore();

    // لا سياق طلب إطلاقًا: مجدول ليلي، عامل طابور، أو سكربت بذور.
    // هذه العمليات عابرة للمستأجرين بطبيعتها.
    if (!store) return { mode: 'system' };

    if (store.systemDepth > 0) return { mode: 'system' };
    if (store.tenantId) return { mode: 'tenant', tenantId: store.tenantId };

    // طلب HTTP بلا هوية: نُغلق الباب بدل أن نفتحه.
    return { mode: 'blocked' };
  }
}
