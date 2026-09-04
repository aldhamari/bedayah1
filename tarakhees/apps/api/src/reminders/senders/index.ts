// ══════════════════════════════════════════════════════════════
//  apps/api/src/reminders/senders/
//
//  محوّلات قنوات الإرسال. مجموعة هنا في ملف واحد للقراءة،
//  والأفضل تقسيمها عند النقل:
//    sender.interface.ts · sender.registry.ts
//    whatsapp.sender.ts · email.sender.ts · sms.sender.ts · in-app.sender.ts
// ══════════════════════════════════════════════════════════════

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReminderChannel } from '@prisma/client';
import * as nodemailer from 'nodemailer';

// ─────────────── الواجهة المشتركة ───────────────

export type SendPayload = {
  recipient: string;
  body: string;                          // للبريد والرسائل النصية
  templateKey: string;                   // لواتساب
  variables: Record<string, string>;     // لواتساب
};

export type SendResult = { providerRef?: string };

export interface NotificationSender {
  send(payload: SendPayload): Promise<SendResult>;
}

/** خطأ يعني: لا تُعد المحاولة، فالمشكلة في المدخلات لا في الشبكة */
export class PermanentSendError extends Error {}

// ─────────────── واتساب (Meta Cloud API) ───────────────
//
// ⚠️ الرسائل المبادِرة تتطلب قالبًا معتمدًا مسبقًا. ترتيب المتغيرات
//    هنا يجب أن يطابق ترتيب {{1}}..{{5}} في القالب حرفيًا، وإلا
//    وصلت الرسالة بحقول مبعثرة. راجعه بعد كل تعديل على القالب.

@Injectable()
export class WhatsAppSender implements NotificationSender {
  private readonly logger = new Logger(WhatsAppSender.name);

  constructor(private readonly config: ConfigService) {}

  async send({ recipient, templateKey, variables }: SendPayload): Promise<SendResult> {
    const phoneNumberId = this.config.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = this.config.getOrThrow<string>('WHATSAPP_TOKEN');
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';

    const to = toE164Saudi(recipient);
    if (!to) throw new PermanentSendError(`رقم غير صالح: ${recipient}`);

    const orderedParams = Object.keys(variables)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => ({ type: 'text', text: variables[k] }));

    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateKey,
          language: { code: 'ar' },
          components: [{ type: 'body', parameters: orderedParams }],
        },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      // 4xx غير 429 = خطأ دائم، إعادة المحاولة لن تفيد
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new PermanentSendError(`واتساب رفض الرسالة: ${msg}`);
      }
      throw new Error(`فشل واتساب مؤقتًا: ${msg}`);
    }

    return { providerRef: data?.messages?.[0]?.id };
  }
}

// ─────────────── البريد الإلكتروني ───────────────

@Injectable()
export class EmailSender implements NotificationSender {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT') ?? 587),
      secure: this.config.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async send({ recipient, body }: SendPayload): Promise<SendResult> {
    const subject = body.split('\n')[0].replace(/^[⚠️🔴🟠🟡]\s*/u, '');

    const info = await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: recipient,
      subject,
      text: body,
      html: toRtlHtml(body),
    });

    return { providerRef: info.messageId };
  }
}

// ─────────────── الرسائل النصية ───────────────
//
// مزوّد محلي (يونيفونيك، مسجات، أو ما تختاره). الشكل أدناه عام —
// بدّل الرابط وحقول الجسم حسب توثيق مزوّدك.

@Injectable()
export class SmsSender implements NotificationSender {
  constructor(private readonly config: ConfigService) {}

  async send({ recipient, body }: SendPayload): Promise<SendResult> {
    const to = toE164Saudi(recipient);
    if (!to) throw new PermanentSendError(`رقم غير صالح: ${recipient}`);

    const res = await fetch(this.config.getOrThrow<string>('SMS_API_URL'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow<string>('SMS_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: to,
        sender: this.config.getOrThrow<string>('SMS_SENDER_NAME'),
        // الرسائل النصية محدودة الطول — نرسل السطرين الأولين فقط
        body: body.split('\n').filter(Boolean).slice(0, 2).join(' — ').slice(0, 300),
      }),
    });

    if (!res.ok) throw new Error(`فشل مزوّد الرسائل: HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return { providerRef: data?.messageId };
  }
}

// ─────────────── داخل التطبيق ───────────────
//
// لا يحتاج إرسالًا: جدول NotificationLog نفسه هو صندوق الوارد.
// المعالج يكتب السجل بعد النجاح، والواجهة تقرأه مباشرة.

@Injectable()
export class InAppSender implements NotificationSender {
  async send(): Promise<SendResult> {
    return {};
  }
}

// ─────────────── السجل ───────────────

@Injectable()
export class NotificationSenderRegistry {
  private readonly map: Record<ReminderChannel, NotificationSender>;

  constructor(
    whatsapp: WhatsAppSender,
    email: EmailSender,
    sms: SmsSender,
    inApp: InAppSender,
  ) {
    this.map = {
      WHATSAPP: whatsapp,
      EMAIL: email,
      SMS: sms,
      IN_APP: inApp,
    };
  }

  get(channel: ReminderChannel): NotificationSender {
    return this.map[channel];
  }
}

// ─────────────── أدوات ───────────────

/**
 * تطبيع أرقام الجوال السعودية إلى E.164 بلا علامة زائد
 * 0501234567 · 501234567 · +966501234567 · 00966501234567 → 966501234567
 * يرجع null إن كان الرقم غير صالح — فيُعامل كخطأ دائم لا يُعاد.
 */
export function toE164Saudi(input: string): string | null {
  const d = input.replace(/\D/g, '');

  if (/^9665\d{8}$/.test(d)) return d;
  if (/^009665\d{8}$/.test(d)) return d.slice(2);
  if (/^05\d{8}$/.test(d)) return `966${d.slice(1)}`;
  if (/^5\d{8}$/.test(d)) return `966${d}`;

  return null;
}

function toRtlHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<div dir="rtl" style="font-family:system-ui,'Segoe UI',Tahoma,sans-serif;
    font-size:15px;line-height:1.9;white-space:pre-wrap;text-align:right">${escaped}</div>`;
}
