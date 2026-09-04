// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/token.service.ts
//
//  JWT وصول قصير الأمد + تدوير رمز التحديث (Refresh Token Rotation).
//
//  ★ أين تُخزَّن رموز التحديث؟ في Redis، لا في قاعدة البيانات.
//    السبب: schema.prisma ملف جاهز لا أُعدّله بلا إذن، وليس فيه جدول
//    للجلسات. Redis موجود أصلًا للطابور ويعمل بـ appendonly، والمفاتيح
//    لها TTL تنتهي تلقائيًا. إن فضّلت جدولًا في القاعدة، أطلب الإذن
//    بإضافة موديل RefreshToken وأنقلها.
//
//  التدوير: كل استعمال لرمز تحديث يُبطله ويُصدر غيره.
//  كشف إعادة الاستعمال: رمز موقَّع صحيحًا لكن jti غير موجود في Redis
//  يعني أنه سُرق وأُعيد استعماله — فنُبطل كل جلسات المستخدم.
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { MemberRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

export type AccessPayload = {
  sub: string; // userId
  tid: string; // tenantId
  role: MemberRole;
  email: string;
  sa: boolean; // isSuperAdmin
};

type RefreshPayload = { sub: string; tid: string; jti: string };

const sessionKey = (userId: string, jti: string) => `rt:${userId}:${jti}`;
const sessionPattern = (userId: string) => `rt:${userId}:*`;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get accessSecret() {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private get refreshSecret() {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private get accessTtl() {
    return this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
  }

  private get refreshTtl() {
    return this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
  }

  async issue(payload: AccessPayload) {
    const jti = randomUUID();

    // المهل تُمرَّر بالثواني لا كنص («15m»): نفس القيمة تُستعمل لـ TTL
    // مفتاح Redis، فيبقى عمر الجلسة في المخزن وعمر الرمز متطابقين.
    const accessTtl = durationToSeconds(this.accessTtl);
    const refreshTtl = durationToSeconds(this.refreshTtl);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { secret: this.accessSecret, expiresIn: accessTtl }),
      this.jwt.signAsync(
        { sub: payload.sub, tid: payload.tid, jti } satisfies RefreshPayload,
        { secret: this.refreshSecret, expiresIn: refreshTtl },
      ),
    ]);

    await this.redis.client.set(sessionKey(payload.sub, jti), payload.tid, 'EX', refreshTtl);

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      return await this.jwt.verifyAsync<AccessPayload>(token, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException('رمز الوصول غير صالح أو منتهٍ');
    }
  }

  /**
   * يتحقق من رمز التحديث ويستهلكه. يُرجع (userId, tenantId) ليعيد
   * المتصل بناء الحمولة من قاعدة البيانات — لا نثق ببيانات داخل الرمز
   * لأن الدور قد يكون تغيّر منذ إصداره.
   */
  async consumeRefresh(token: string): Promise<{ userId: string; tenantId: string }> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('رمز التحديث غير صالح أو منتهٍ');
    }

    const deleted = await this.redis.client.del(sessionKey(payload.sub, payload.jti));

    if (deleted === 0) {
      // التوقيع صحيح لكن الجلسة مستهلكة سلفًا: إما تدوير مكرر أو رمز مسروق.
      // لا نستطيع التمييز، فنفترض الأسوأ ونُنهي كل الجلسات.
      await this.revokeAll(payload.sub);
      this.logger.warn(`إعادة استعمال رمز تحديث للمستخدم ${payload.sub} — أُبطلت كل جلساته`);
      throw new UnauthorizedException('انتهت الجلسة — سجّل الدخول من جديد');
    }

    return { userId: payload.sub, tenantId: payload.tid };
  }

  /** خروج من الجهاز الحالي فقط */
  async revoke(token: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.refreshSecret,
      });
      await this.redis.client.del(sessionKey(payload.sub, payload.jti));
    } catch {
      // رمز تالف أو منتهٍ: الخروج ينجح على أي حال، فلا فائدة من إزعاج المستخدم
    }
  }

  /** خروج من كل الأجهزة — يُستدعى أيضًا عند كشف إعادة الاستعمال */
  async revokeAll(userId: string): Promise<void> {
    const keys = await this.redis.scanKeys(sessionPattern(userId));
    if (keys.length > 0) await this.redis.client.del(...keys);
  }
}

/** يحوّل «15m» / «30d» / «3600» إلى ثوانٍ */
export function durationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) throw new Error(`مدة غير مفهومة: ${value}`);

  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit]!;

  return amount * factor;
}
