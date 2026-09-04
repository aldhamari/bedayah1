// ══════════════════════════════════════════════════════════════
//  apps/api/src/redis/redis.service.ts
//
//  اتصال Redis واحد مشترك للجلسات والدعوات. الطابور (BullMQ) يدير
//  اتصاله بنفسه من نفس متغيرات البيئة في reminders.module.ts.
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST') ?? 'localhost',
      port: Number(config.get('REDIS_PORT') ?? 6379),
      password: config.get('REDIS_PASSWORD') || undefined,

      // ★ ليس null عمدًا. BullMQ يفرض null على اتصاله هو (ويديره بنفسه)،
      //   لكن هذا العميل يخدم الجلسات والدعوات في مسار الطلب: null هنا
      //   يعني أن محاولة دخول أثناء توقف Redis تتعلّق إلى الأبد بدل أن
      //   تُرجع خطأً. ثلاث محاولات ثم فشل صريح أفضل من طلب لا ينتهي.
      maxRetriesPerRequest: 3,
      connectTimeout: 5_000,
      enableOfflineQueue: false,
    });

    this.client.on('error', (err) => this.logger.error(`خطأ اتصال Redis: ${err.message}`));
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
