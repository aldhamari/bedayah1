// ══════════════════════════════════════════════════════════════
//  apps/api/src/auth/invitation.service.ts
//
//  دعوات الأعضاء، مخزَّنة في Redis بمهلة انتهاء تلقائية.
//  (نفس سبب رموز التحديث: لا جدول للدعوات في schema.prisma الجاهز.)
//
//  الرمز عشوائي 32 بايت، ويُخزَّن مُجزَّأً — من يقرأ Redis لا يستطيع
//  استعمال الدعوات التي فيه، تمامًا كما لا تُخزَّن كلمات المرور خامًا.
// ══════════════════════════════════════════════════════════════

import { Injectable } from '@nestjs/common';
import type { MemberRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { RedisService } from '../redis/redis.service';

export const INVITE_TTL_DAYS = 7;

export type InviteRecord = {
  tenantId: string;
  tenantName: string;
  email: string;
  role: MemberRole;
  invitedByUserId: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const inviteKey = (token: string) => `inv:${hashToken(token)}`;
/** فهرس ثانوي ليعرض OWNER دعوات منشأته المعلّقة */
const tenantIndexKey = (tenantId: string) => `inv-idx:${tenantId}`;

@Injectable()
export class InvitationService {
  constructor(private readonly redis: RedisService) {}

  async create(input: Omit<InviteRecord, 'createdAt' | 'expiresAt'>): Promise<{
    token: string;
    record: InviteRecord;
  }> {
    const token = randomBytes(32).toString('base64url');
    const ttl = INVITE_TTL_DAYS * 86400;
    const now = new Date();

    const record: InviteRecord = {
      ...input,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    };

    await this.redis.client
      .multi()
      .set(inviteKey(token), JSON.stringify(record), 'EX', ttl)
      .sadd(tenantIndexKey(input.tenantId), hashToken(token))
      .expire(tenantIndexKey(input.tenantId), ttl)
      .exec();

    return { token, record };
  }

  async read(token: string): Promise<InviteRecord | null> {
    const raw = await this.redis.client.get(inviteKey(token));
    return raw ? (JSON.parse(raw) as InviteRecord) : null;
  }

  /** الدعوة تُستهلك مرة واحدة — الاستهلاك ذرّي حتى لا يقبلها اثنان معًا */
  async consume(token: string): Promise<InviteRecord | null> {
    const raw = await this.redis.client.getdel(inviteKey(token));
    if (!raw) return null;

    const record = JSON.parse(raw) as InviteRecord;
    await this.redis.client.srem(tenantIndexKey(record.tenantId), hashToken(token));

    return record;
  }

  async revoke(token: string): Promise<boolean> {
    const record = await this.consume(token);
    return record !== null;
  }

  /**
   * الدعوات المعلّقة لمنشأة. الرموز نفسها لا تُعاد (مُجزَّأة في Redis)
   * — فمن فقد الرابط يُرسَل له دعوة جديدة، ولا يُستخرج القديم.
   */
  async listPending(tenantId: string): Promise<Omit<InviteRecord, 'tenantId'>[]> {
    const hashes = await this.redis.client.smembers(tenantIndexKey(tenantId));
    if (hashes.length === 0) return [];

    const raws = await this.redis.client.mget(...hashes.map((h) => `inv:${h}`));
    const stale: string[] = [];
    const records: Omit<InviteRecord, 'tenantId'>[] = [];

    raws.forEach((raw, i) => {
      if (!raw) {
        stale.push(hashes[i]); // انتهت مهلتها فاختفت، ونظّف الفهرس
        return;
      }
      const { tenantId: _omit, ...rest } = JSON.parse(raw) as InviteRecord;
      records.push(rest);
    });

    if (stale.length > 0) await this.redis.client.srem(tenantIndexKey(tenantId), ...stale);

    return records;
  }
}
