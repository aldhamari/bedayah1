// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/jwt-auth.guard.ts
//
//  المسار والاسم مفروضان من licenses-bulk.service.ts (ملف جاهز).
//  مسجَّل عالميًا في AuthModule، والاستثناء بـ @Public().
//
//  يفعل ثلاثة أشياء بالترتيب:
//    ١. يتحقق من توقيع رمز الوصول
//    ٢. يؤكد أن العضوية ما زالت قائمة في قاعدة البيانات
//    ٣. يملأ سياق المستأجر الذي يبني عليه امتداد Prisma عزله
// ══════════════════════════════════════════════════════════════

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AuthUser, REQUEST_USER_KEY } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SuperAdminService } from './super-admin.service';
import { TokenService } from './token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly ctx: TenantContextService,
    private readonly superAdmin: SuperAdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    // الحارس مسجَّل عالميًا وقد يُذكر مرة أخرى بـ @UseGuards على المتحكم
    // (كما في LicensesController الجاهز) — فلا نُكرّر العمل.
    if (request[REQUEST_USER_KEY]) return true;

    const token = extractBearer(request.headers?.authorization);
    if (!token) throw new UnauthorizedException('رمز الوصول مفقود');

    const payload = await this.tokens.verifyAccess(token);

    // التحقق من العضوية داخل سياق النظام: الاستعلام نفسه على جدول
    // مملوك لمستأجر، ولم يُضبط سياق المستأجر بعد.
    const membership = await this.ctx.runAsSystem(() =>
      this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: payload.tid, userId: payload.sub } },
        select: {
          role: true,
          tenant: { select: { isActive: true } },
          user: { select: { email: true, fullName: true } },
        },
      }),
    );

    // العضوية تُقرأ من القاعدة لا من الرمز: من أُخرج من المنشأة
    // يفقد وصوله فورًا، لا بعد انتهاء صلاحية رمزه.
    if (!membership) throw new UnauthorizedException('لم تعد عضوًا في هذه المنشأة');
    if (!membership.tenant.isActive) throw new UnauthorizedException('حساب المنشأة موقوف');

    const user: AuthUser = {
      userId: payload.sub,
      email: membership.user.email,
      fullName: membership.user.fullName,
      tenantId: payload.tid,
      role: membership.role,
      isSuperAdmin: this.superAdmin.is(membership.user.email),
    };

    request[REQUEST_USER_KEY] = user;

    this.ctx.authenticate({
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    });

    return true;
  }
}

function extractBearer(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
