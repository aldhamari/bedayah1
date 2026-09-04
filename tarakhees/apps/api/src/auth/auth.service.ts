// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/auth.service.ts
//
//  تسجيل · دخول · تدوير · دعوات. Argon2id لكلمات المرور.
// ══════════════════════════════════════════════════════════════

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MemberRole, Prisma } from '@prisma/client';
import type {
  AcceptInviteInput,
  AuthResponse,
  InviteInput,
  LoginInput,
  PendingInvite,
  RegisterInput,
  SessionUser,
} from '@repo/shared/auth/auth.schema';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { InvitationService } from './invitation.service';
import { SuperAdminService } from './super-admin.service';
import { TokenService } from './token.service';

/**
 * إعدادات Argon2id. القيم من توصيات OWASP: 19MiB ذاكرة، دورتان،
 * تفرّع واحد. الذاكرة هي ما يجعل التخمين بالعتاد مكلفًا، لا عدد الدورات.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * تجزئة وهمية بنفس الإعدادات، تُقارَن بها كلمة المرور حين لا يوجد
 * مستخدم بهذا البريد — فيتساوى زمن الرد ولا يكشف من له حساب ومن لا.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E$3vJqPvKZ8Y1oJ6qYQ0Z7Xk1oJ6qYQ0Z7Xk1oJ6qYQ0Y';

/** مهل التنبيه الافتراضية عند إنشاء منشأة: ٦٠ · ٣٠ · ٧ · يوم الانتهاء */
const DEFAULT_OFFSETS = [60, 30, 7, 0];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly invites: InvitationService,
    private readonly superAdmin: SuperAdminService,
    private readonly ctx: TenantContextService,
  ) {}

  // ─────────────────────────────────────────────────────────
  //  التسجيل — ينشئ المستخدم والمنشأة والعضوية معًا
  // ─────────────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<AuthResponse> {
    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);

    // سياق النظام: لا مستأجر بعد، والمعاملة تُنشئه.
    const tenantId = await this.ctx.runAsSystem(async () => {
      const existing = await this.prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('هذا البريد مسجّل مسبقًا — سجّل الدخول بدلًا من ذلك');
      }

      // كل شيء أو لا شيء: مستخدم بلا منشأة أو منشأة بلا مالك
      // حالتان لا يستطيع النظام التعافي منهما.
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            fullName: input.fullName,
            phone: input.phone ?? null,
            passwordHash,
          },
          select: { id: true },
        });

        const tenant = await tx.tenant.create({
          data: { name: input.tenantName, crNumber: input.crNumber ?? null },
          select: { id: true },
        });

        await tx.membership.create({
          data: { tenantId: tenant.id, userId: user.id, role: MemberRole.OWNER },
        });

        // منشأة بلا قواعد تنبيه لا تُرسل شيئًا — وهي وظيفة المنتج كلها.
        await tx.reminderRule.createMany({
          data: DEFAULT_OFFSETS.flatMap((offsetDays) => [
            { tenantId: tenant.id, offsetDays, channel: 'EMAIL' as const },
            { tenantId: tenant.id, offsetDays, channel: 'IN_APP' as const },
          ]),
        });

        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            action: 'tenant.created',
            entityType: 'Tenant',
            entityId: tenant.id,
            diff: { name: input.tenantName },
          },
        });

        return tenant.id;
      });
    });

    return this.buildSession(input.email, tenantId);
  }

  // ─────────────────────────────────────────────────────────
  //  الدخول
  // ─────────────────────────────────────────────────────────

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.ctx.runAsSystem(() =>
      this.prisma.user.findUnique({
        where: { email: input.email },
        select: {
          id: true,
          passwordHash: true,
          memberships: {
            where: { tenant: { isActive: true } },
            select: { tenantId: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      }),
    );

    // نتحقق دائمًا — حتى بلا مستخدم — حتى لا يفرّق زمن الرد بين
    // «بريد غير مسجّل» و«كلمة مرور خاطئة».
    const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, input.password).catch(
      () => false,
    );

    if (!user || !valid) throw new UnauthorizedException('البريد أو كلمة المرور غير صحيحة');

    const membership = user.memberships[0];
    if (!membership) throw new ForbiddenException('لا توجد منشأة نشطة مرتبطة بحسابك');

    return this.buildSession(input.email, membership.tenantId);
  }

  // ─────────────────────────────────────────────────────────
  //  التدوير والخروج
  // ─────────────────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const { userId, tenantId } = await this.tokens.consumeRefresh(refreshToken);

    const user = await this.ctx.runAsSystem(() =>
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    );
    if (!user) throw new UnauthorizedException('الحساب لم يعد موجودًا');

    // الدور يُعاد قراءته من القاعدة: من خُفّضت صلاحيته لا يستعيدها بالتدوير.
    return this.buildSession(user.email, tenantId);
  }

  async logout(refreshToken: string | undefined): Promise<{ ok: true }> {
    if (refreshToken) await this.tokens.revoke(refreshToken);
    return { ok: true };
  }

  async logoutEverywhere(userId: string): Promise<{ ok: true }> {
    await this.tokens.revokeAll(userId);
    return { ok: true };
  }

  /** التبديل بين المنشآت لمن ينتمي إلى أكثر من واحدة */
  async switchTenant(userId: string, tenantId: string): Promise<AuthResponse> {
    const membership = await this.ctx.runAsSystem(() =>
      this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        select: { tenant: { select: { isActive: true } }, user: { select: { email: true } } },
      }),
    );

    if (!membership) throw new ForbiddenException('لست عضوًا في هذه المنشأة');
    if (!membership.tenant.isActive) throw new ForbiddenException('حساب المنشأة موقوف');

    return this.buildSession(membership.user.email, tenantId);
  }

  // ─────────────────────────────────────────────────────────
  //  الدعوات
  // ─────────────────────────────────────────────────────────

  async invite(
    inviter: { userId: string; fullName: string; tenantId: string },
    input: InviteInput,
  ): Promise<{ token: string; inviteUrl: string; expiresAt: string }> {
    const [tenant, alreadyMember] = await this.ctx.runAsSystem(() =>
      Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: inviter.tenantId },
          select: { name: true },
        }),
        this.prisma.membership.findFirst({
          where: { tenantId: inviter.tenantId, user: { email: input.email } },
          select: { id: true },
        }),
      ]),
    );

    if (!tenant) throw new NotFoundException('المنشأة غير موجودة');
    if (alreadyMember) throw new ConflictException('هذا الشخص عضو في المنشأة بالفعل');

    const { token, record } = await this.invites.create({
      tenantId: inviter.tenantId,
      tenantName: tenant.name,
      email: input.email,
      role: input.role as MemberRole,
      invitedByUserId: inviter.userId,
      invitedByName: inviter.fullName,
    });

    // الإرسال بالبريد ليس ضمن هذه المهمة، فنُعيد الرابط ليُرسله المالك
    // بنفسه. القناة البريدية موجودة في EmailSender وتُوصَل لاحقًا.
    return {
      token,
      inviteUrl: `/auth/accept-invite?token=${token}`,
      expiresAt: record.expiresAt,
    };
  }

  async listInvites(tenantId: string): Promise<PendingInvite[]> {
    const pending = await this.invites.listPending(tenantId);
    return pending.map((p) => ({
      token: '',
      email: p.email,
      role: p.role,
      invitedByName: p.invitedByName,
      expiresAt: p.expiresAt,
    }));
  }

  async revokeInvite(tenantId: string, token: string): Promise<{ ok: true }> {
    const record = await this.invites.read(token);
    if (!record || record.tenantId !== tenantId) throw new NotFoundException('الدعوة غير موجودة');

    await this.invites.revoke(token);
    return { ok: true };
  }

  async acceptInvite(input: AcceptInviteInput): Promise<AuthResponse> {
    const invite = await this.invites.read(input.token);
    if (!invite) throw new NotFoundException('الدعوة غير صالحة أو انتهت مهلتها');

    const email = await this.ctx.runAsSystem(async () => {
      const existing = await this.prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true },
      });

      if (!existing && (!input.password || !input.fullName)) {
        throw new BadRequestException('لا حساب لك بعد — أرسل الاسم وكلمة المرور مع الدعوة');
      }

      const passwordHash = input.password
        ? await argon2.hash(input.password, ARGON_OPTIONS)
        : null;

      await this.prisma.$transaction(async (tx) => {
        // الاستهلاك داخل المعاملة: لو فشل إنشاء العضوية بقيت الدعوة صالحة
        const consumed = await this.invites.consume(input.token);
        if (!consumed) throw new ConflictException('استُخدمت هذه الدعوة بالفعل');

        const user =
          existing ??
          (await tx.user.create({
            data: {
              email: invite.email,
              fullName: input.fullName!,
              passwordHash: passwordHash!,
            },
            select: { id: true },
          }));

        await tx.membership.create({
          data: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
        });

        await tx.auditLog.create({
          data: {
            tenantId: invite.tenantId,
            userId: user.id,
            action: 'membership.accepted',
            entityType: 'Membership',
            entityId: user.id,
            diff: { role: invite.role, invitedBy: invite.invitedByUserId },
          },
        });
      });

      return invite.email;
    });

    return this.buildSession(email, invite.tenantId);
  }

  // ─────────────────────────────────────────────────────────
  //  الأعضاء
  // ─────────────────────────────────────────────────────────

  async listMembers(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async changeRole(tenantId: string, targetUserId: string, role: MemberRole, actorId: string) {
    if (targetUserId === actorId) {
      throw new BadRequestException('لا يمكنك تغيير دورك بنفسك');
    }
    await this.assertNotLastOwner(tenantId, targetUserId, role);

    return this.prisma.membership.update({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
      data: { role },
      select: { id: true, role: true },
    });
  }

  async removeMember(tenantId: string, targetUserId: string, actorId: string) {
    if (targetUserId === actorId) throw new BadRequestException('لا يمكنك إخراج نفسك');
    await this.assertNotLastOwner(tenantId, targetUserId, MemberRole.VIEWER);

    await this.prisma.membership.delete({
      where: { tenantId_userId: { tenantId, userId: targetUserId } },
    });

    // الجلسات القائمة تموت فورًا: الحارس يقرأ العضوية من القاعدة كل طلب،
    // لكن نُبطل رموز التحديث أيضًا حتى لا يبقى له طريق عودة.
    await this.tokens.revokeAll(targetUserId);

    return { ok: true as const };
  }

  /** منشأة بلا مالك لا يستطيع أحد إدارتها — وهذا باب لا يُغلق بعد فتحه */
  private async assertNotLastOwner(tenantId: string, userId: string, newRole: MemberRole) {
    if (newRole === MemberRole.OWNER) return;

    const target = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    });
    if (target?.role !== MemberRole.OWNER) return;

    const owners = await this.prisma.membership.count({
      where: { tenantId, role: MemberRole.OWNER },
    });
    if (owners <= 1) {
      throw new BadRequestException('لا يمكن ترك المنشأة بلا مالك — عيّن مالكًا آخر أولًا');
    }
  }

  // ─────────────────────────────────────────────────────────
  //  بناء الجلسة
  // ─────────────────────────────────────────────────────────

  async currentSession(userId: string, tenantId: string): Promise<SessionUser> {
    return this.ctx.runAsSystem(() => this.loadSessionUser(userId, tenantId));
  }

  private async buildSession(email: string, tenantId: string): Promise<AuthResponse> {
    const user = await this.ctx.runAsSystem(async () => {
      const found = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!found) throw new UnauthorizedException('الحساب غير موجود');
      return this.loadSessionUser(found.id, tenantId);
    });

    const tokens = await this.tokens.issue({
      sub: user.userId,
      tid: user.tenantId,
      role: user.role as MemberRole,
      email: user.email,
      sa: user.isSuperAdmin,
    });

    return { ...tokens, user };
  }

  /** يُستدعى دائمًا داخل runAsSystem — يقرأ عضويات عدة مستأجرين */
  private async loadSessionUser(userId: string, tenantId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        memberships: {
          where: { tenant: { isActive: true } },
          select: { tenantId: true, role: true, tenant: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) throw new UnauthorizedException('الحساب غير موجود');

    const active = user.memberships.find((m) => m.tenantId === tenantId);
    if (!active) throw new ForbiddenException('لست عضوًا في هذه المنشأة');

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      tenantId,
      tenantName: active.tenant.name,
      role: active.role,
      isSuperAdmin: this.superAdmin.is(user.email),
      tenants: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        role: m.role,
      })),
    };
  }
}
