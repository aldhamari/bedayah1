// ══════════════════════════════════════════════════════════════
//  packages/shared/src/auth/auth.schema.ts
//
//  عقود المصادقة، تستوردها الواجهة والـ API معًا — نفس أسلوب
//  bulk-import.schema.ts فلا ينحرف أحدهما عن الآخر.
// ══════════════════════════════════════════════════════════════

import { z } from 'zod';

export const MEMBER_ROLES = ['OWNER', 'MANAGER', 'VIEWER'] as const;
export type MemberRoleValue = (typeof MEMBER_ROLES)[number];

/** أقل طول لكلمة المرور. Argon2id يتكفل بالباقي — لا نفرض رموزًا ولا أرقامًا:
 *  قواعد التعقيد تدفع الناس إلى «Passw0rd!» وهي أسوأ من عبارة طويلة. */
export const PASSWORD_MIN = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('بريد إلكتروني غير صالح')
  .max(254);

const password = z
  .string()
  .min(PASSWORD_MIN, `كلمة المرور يجب ألا تقل عن ${PASSWORD_MIN} خانات`)
  .max(200, 'كلمة المرور طويلة أكثر من اللازم');

/** جوال سعودي بأي صيغة شائعة — التطبيع إلى E.164 في toE164Saudi بالخادم */
const saudiPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?966|00966|0)?5\d{8}$/, 'رقم جوال سعودي غير صالح');

// ─────────────── التسجيل ───────────────
//
// أول تسجيل يُنشئ المستخدم والمستأجر معًا، ويجعل المسجِّل OWNER.

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'الاسم مطلوب').max(120),
  email,
  password,
  phone: saudiPhone.nullish(),
  tenantName: z.string().trim().min(2, 'اسم المنشأة مطلوب').max(160),
  crNumber: z.string().trim().max(20).nullish(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const switchTenantSchema = z.object({
  tenantId: z.string().min(1),
});

// ─────────────── الدعوات ───────────────

export const inviteSchema = z.object({
  email,
  role: z.enum(MEMBER_ROLES),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, 'رمز الدعوة مطلوب'),
  // مطلوبان فقط إن لم يكن للمدعوّ حساب بعد
  fullName: z.string().trim().min(2).max(120).nullish(),
  password: password.nullish(),
});

// ─────────────── أشكال الردود ───────────────

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // ثوانٍ حتى انتهاء رمز الوصول
};

export type TenantSummary = {
  tenantId: string;
  tenantName: string;
  role: MemberRoleValue;
};

export type SessionUser = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  tenantId: string;
  tenantName: string;
  role: MemberRoleValue;
  isSuperAdmin: boolean;
  /** كل المنشآت التي ينتمي إليها — للتبديل بينها */
  tenants: TenantSummary[];
};

export type AuthResponse = AuthTokens & { user: SessionUser };

export type PendingInvite = {
  token: string;
  email: string;
  role: MemberRoleValue;
  invitedByName: string;
  expiresAt: string;
};

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type SwitchTenantInput = z.infer<typeof switchTenantSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
