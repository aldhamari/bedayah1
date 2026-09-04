// ══════════════════════════════════════════════════════════════
//  apps/api/src/crypto/field-crypto.service.ts
//
//  تشفير حقول حسّاسة في طبقة التطبيق — القاعدة الثابتة رقم ٤:
//  «لا تخزّن رقم الهوية أو الإقامة بلا تشفير.»
//
//  AES-256-GCM: يعطي سريّة وسلامة معًا، فتعديل النص المشفَّر في
//  قاعدة البيانات يُكشف عند فك التشفير بدل أن يمرّ كقيمة مختلفة.
//
//  المفتاح من متغير بيئة لا من قاعدة البيانات — من نسخ نسخة احتياطية
//  من القاعدة لا يحصل على المفتاح معها.
//  (وثيقة التصميم فعّلت pgcrypto أيضًا، لكنها نصّت على التشفير في
//   طبقة التطبيق بمفتاح من متغيرات البيئة، وهذا ما نفعله هنا.)
// ══════════════════════════════════════════════════════════════

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // المقاس القياسي لـ GCM
const PREFIX = 'v1'; // بادئة إصدار — لتدوير المفتاح لاحقًا بلا لبس

@Injectable()
export class FieldCryptoService {
  private readonly logger = new Logger(FieldCryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('FIELD_ENCRYPTION_KEY');
    this.key = raw ? Buffer.from(raw, 'base64') : null;

    if (!this.key) {
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY غير مضبوط — سيُرفض حفظ أرقام الهوية. ' +
          'ولّد مفتاحًا: openssl rand -base64 32',
      );
    } else if (this.key.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY يجب أن يكون ٣٢ بايت بترميز base64');
    }
  }

  get isConfigured(): boolean {
    return this.key !== null;
  }

  /** يُرجع `v1:iv:tag:ciphertext` كلها base64url */
  encrypt(plain: string | null | undefined): string | null {
    if (plain === null || plain === undefined || plain === '') return null;

    if (!this.key) {
      // الرفض أفضل من الحفظ خامًا — القاعدة الثابتة لا تحتمل استثناءً.
      throw new InternalServerErrorException(
        'تشفير الحقول غير مهيّأ — لا يمكن حفظ رقم الهوية',
      );
    }

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [
      PREFIX,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!this.key) return null;

    const [version, ivB64, tagB64, dataB64] = stored.split(':');
    if (version !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
      this.logger.error('قيمة مشفَّرة بصيغة غير معروفة — تُعامَل كفارغة');
      return null;
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // فشل التحقق من وسم GCM: المفتاح تغيّر أو عُبث بالصف.
      this.logger.error('فشل فك تشفير حقل — مفتاح خاطئ أو صف مُعدَّل');
      return null;
    }
  }

  /**
   * للعرض في القوائم: آخر أربعة أرقام فقط.
   * القوائم لا تحتاج الرقم كاملًا، وكل عرض كامل زائد هو تسريب محتمل.
   */
  mask(stored: string | null | undefined): string | null {
    const plain = this.decrypt(stored);
    return plain ? `${'•'.repeat(Math.max(0, plain.length - 4))}${plain.slice(-4)}` : null;
  }
}
