// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/current-user.decorator.ts
//
//  المسار والأسماء مفروضان من licenses-bulk.service.ts (ملف جاهز):
//      import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
// ══════════════════════════════════════════════════════════════

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';

/** ما يعرفه الخادم عن صاحب الطلب بعد اجتياز JwtAuthGuard */
export type AuthUser = {
  userId: string;
  email: string;
  fullName: string;
  /** المستأجر الفعّال في هذا الطلب — مصدره الرمز لا معاملات الطلب */
  tenantId: string;
  role: MemberRole;
  isSuperAdmin: boolean;
};

export const REQUEST_USER_KEY = 'authUser';

export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext): AuthUser | unknown => {
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request[REQUEST_USER_KEY];
    return field && user ? user[field] : user;
  },
);
