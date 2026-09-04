// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/auth.controller.ts
// ══════════════════════════════════════════════════════════════

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import {
  acceptInviteSchema,
  inviteSchema,
  loginSchema,
  MEMBER_ROLES,
  refreshSchema,
  registerSchema,
  switchTenantSchema,
} from '@repo/shared/auth/auth.schema';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { Roles, RolesGuard } from './roles.guard';

/** يحوّل أخطاء Zod إلى 422 بشكل موحّد بدل تكرار المحاولة في كل مسار */
function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new UnprocessableEntityException({
      ok: false,
      errors: result.error.issues.map((i) => ({
        field: String(i.path[0] ?? ''),
        message: i.message,
      })),
    });
  }
  return result.data;
}

@Controller('auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ─────────── مفتوحة ───────────

  @Public()
  @Post('register')
  register(@Body() body: unknown) {
    return this.auth.register(parse(registerSchema, body));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.auth.login(parse(loginSchema, body));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parse(refreshSchema, body).refreshToken);
  }

  @Public()
  @Post('accept-invite')
  acceptInvite(@Body() body: unknown) {
    return this.auth.acceptInvite(parse(acceptInviteSchema, body));
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Body() body: unknown) {
    const parsed = refreshSchema.partial().safeParse(body ?? {});
    return this.auth.logout(parsed.success ? parsed.data.refreshToken : undefined);
  }

  // ─────────── تحتاج مصادقة ───────────

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.currentSession(user.userId, user.tenantId);
  }

  @Post('logout-all')
  @HttpCode(200)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutEverywhere(user.userId);
  }

  @Post('switch-tenant')
  @HttpCode(200)
  switchTenant(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.switchTenant(user.userId, parse(switchTenantSchema, body).tenantId);
  }

  // ─────────── الدعوات والأعضاء ───────────

  @Post('invitations')
  @Roles('OWNER')
  invite(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.invite(user, parse(inviteSchema, body));
  }

  @Get('invitations')
  @Roles('OWNER')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.auth.listInvites(user.tenantId);
  }

  @Delete('invitations/:token')
  @Roles('OWNER')
  revokeInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.auth.revokeInvite(user.tenantId, token);
  }

  @Get('members')
  @Roles('OWNER', 'MANAGER')
  listMembers(@CurrentUser() user: AuthUser) {
    return this.auth.listMembers(user.tenantId);
  }

  @Patch('members/:userId/role')
  @Roles('OWNER')
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
    @Body() body: unknown,
  ) {
    const { role } = parse(z.object({ role: z.enum(MEMBER_ROLES) }), body);
    return this.auth.changeRole(user.tenantId, targetUserId, role as MemberRole, user.userId);
  }

  @Delete('members/:userId')
  @Roles('OWNER')
  removeMember(@CurrentUser() user: AuthUser, @Param('userId') targetUserId: string) {
    return this.auth.removeMember(user.tenantId, targetUserId, user.userId);
  }
}
