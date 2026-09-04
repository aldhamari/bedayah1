// ══════════════════════════════════════════════════════════════
//  جسر مسار مؤقت.
//
//  `reminder.processor.ts` (ملف جاهز) يستورد من './senders/sender.registry'،
//  بينما المحوّلات كلها مجمّعة حاليًا في './senders/index.ts' (ملف جاهز أيضًا).
//  لم أُعدّل أيًّا منهما — القاعدة في CLAUDE.md تمنع ذلك بلا إذن — فأضفت
//  هذا الملف ليُطابق المسار المتوقَّع.
//
//  الحل النهائي المقصود (كما يذكر ترويسة senders/index.ts) هو تقسيم
//  الملف إلى: sender.interface.ts · sender.registry.ts · whatsapp.sender.ts
//  · email.sender.ts · sms.sender.ts · in-app.sender.ts
//  وذلك يتطلب إذنك لأنه يمسّ ملفًا جاهزًا.
// ══════════════════════════════════════════════════════════════

export {
  NotificationSenderRegistry,
  WhatsAppSender,
  EmailSender,
  SmsSender,
  InAppSender,
  PermanentSendError,
  toE164Saudi,
} from './index';

export type { NotificationSender, SendPayload, SendResult } from './index';
