// ══════════════════════════════════════════════════════════════
//  apps/api/src/redis/redis.service.ts
//
//  اتصال Redis واحد مشترك للجلسات والدعوات. الطابور (BullMQ) يدير
//  اتصاله بنفسه من نفس متغيرات البيئة في reminders.module.ts.
// ══════════════════════════════════════════════════════════════

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: config.get('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    });
  }

  /**
   * مسح المفاتيح بـ SCAN لا KEYS — KEYS يقفل الخادم كاملًا أثناء
   * تنفيذه، وهو ما يعني توقف كل الطلبات على مستأجر لديه جلسات كثيرة.
   */
  async scanKeys(pattern: string): Promise<string[]> {
    const found: string[] = [];
    let cursor = '0';

    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      found.push(...keys);
      cursor = next;
    } while (cursor !== '0');

    return found;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
