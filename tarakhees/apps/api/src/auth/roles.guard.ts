// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/roles.guard.ts
//
//  المسار والاسمان مفروضان من licenses-bulk.service.ts (ملف جاهز):
//      import { RolesGuard, Roles } from '../auth/roles.guard';
//      @Roles('OWNER', 'MANAGER')
//
//  ويدعم كذلك 'SUPER_ADMIN' الذي تطلبه المهمة ٤ في
//  POST /admin/reminders/run.
// ══════════════════════════════════════════════════════════════

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MemberRole } from '@prisma/client';
import type { AuthUser } from './current-user.decorator';
import { REQUEST_USER_KEY } from './current-user.decorator';

/** أدوار المستأجر الثلاثة، مضافًا إليها دور المنصّة */
export type AppRole = MemberRole | 'SUPER_ADMIN';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

const ROLE_LABEL: Record<AppRole, string> = {
  OWNER: 'مالك',
  MANAGER: 'مدير',
  VIEWER: 'مطّلع',
  SUPER_ADMIN: 'مشرف المنصة',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request[REQUEST_USER_KEY];

    // JwtAuthGuard يسبقه دائمًا. غيابه يعني خطأ في الترتيب لا نقص صلاحية.
    if (!user) throw new ForbiddenException('لا توجد هوية في الطلب');

    // مشرف المنصة يتجاوز أدوار المستأجر، لكن لا يتجاوز عزل البيانات:
    // سياق المستأجر ما زال محصورًا بالمنشأة التي في رمزه.
    if (user.isSuperAdmin) return true;

    if (required.includes(user.role)) return true;

    throw new ForbiddenException(
      `هذا الإجراء يحتاج صلاحية: ${required.map((r) => ROLE_LABEL[r]).join(' أو ')}`,
    );
  }
}
