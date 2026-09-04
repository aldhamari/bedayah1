// ══════════════════════════════════════════════════════════════
//  apps/api/src/reminders/reminder.templates.ts
//
//  صياغة رسائل التنبيه. تتدرج اللهجة حسب القرب من الانتهاء:
//  تذكير هادئ عند ٦٠ يومًا، وإنذار صريح عند التأخر.
//
//  ⚠️ واتساب لا يقبل نصًا حرًا للرسائل المبادِرة — يجب اعتماد قالب
//     مسبقًا لدى المزوّد. لهذا ترجع الدالة templateKey و variables
//     بجانب النص: النص للبريد والرسائل النصية، والمتغيرات لواتساب.
//     ابدأ إجراءات الاعتماد مبكرًا، فهي تستغرق أيامًا.
// ══════════════════════════════════════════════════════════════

export type ReminderContext = {
  offsetDays: number;
  typeName: string;
  authority?: string | null;
  holderName: string;
  number?: string | null;
  expiryDate: Date;
  expiryHijri?: string | null;
  penaltyNote?: string | null;
  renewalUrl?: string | null;
};

export type BuiltMessage = {
  templateKey: 'license_expiry_notice' | 'license_overdue_notice';
  body: string;
  variables: Record<string, string>;
};

export function buildReminderMessage(ctx: ReminderContext): BuiltMessage {
  const isOverdue = ctx.offsetDays < 0;
  const days = Math.abs(ctx.offsetDays);
  const gregorian = formatGregorian(ctx.expiryDate);
  const dateLine = ctx.expiryHijri ? `${gregorian} (${ctx.expiryHijri} هـ)` : gregorian;

  const headline = isOverdue
    ? `⚠️ ${ctx.typeName} منتهي منذ ${arabicDays(days)}`
    : ctx.offsetDays === 0
      ? `⚠️ ${ctx.typeName} ينتهي اليوم`
      : `${urgencyIcon(ctx.offsetDays)} ${ctx.typeName} ينتهي خلال ${arabicDays(days)}`;

  const lines = [
    headline,
    '',
    `الجهة: ${ctx.holderName}`,
    ctx.number ? `الرقم: ${ctx.number}` : null,
    `تاريخ الانتهاء: ${dateLine}`,
    ctx.authority ? `جهة الإصدار: ${ctx.authority}` : null,
  ].filter(Boolean) as string[];

  if (ctx.penaltyNote) {
    lines.push('', isOverdue ? `الأثر: ${ctx.penaltyNote}` : `في حال التأخر: ${ctx.penaltyNote}`);
  }

  if (ctx.renewalUrl) {
    lines.push('', `التجديد: ${ctx.renewalUrl}`);
  }

  lines.push(
    '',
    isOverdue
      ? 'يرجى المبادرة بالتجديد أو تحديث الحالة في النظام لإيقاف التنبيهات.'
      : 'بعد التجديد، حدّث التاريخ في النظام ليتوقف التذكير.',
  );

  return {
    templateKey: isOverdue ? 'license_overdue_notice' : 'license_expiry_notice',
    body: lines.join('\n'),
    // ترتيب المتغيرات يجب أن يطابق ترتيب {{1}}..{{5}} في قالب واتساب المعتمد
    variables: {
      '1': ctx.typeName,
      '2': ctx.holderName,
      '3': dateLine,
      '4': String(days),
      '5': ctx.penaltyNote ?? '—',
    },
  };
}

function urgencyIcon(offsetDays: number): string {
  if (offsetDays <= 7) return '🔴';
  if (offsetDays <= 30) return '🟠';
  return '🟡';
}

/** صياغة عربية سليمة للعدد: يوم / يومان / ٣-١٠ أيام / ١١+ يومًا */
function arabicDays(n: number): string {
  if (n === 0) return 'اليوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n <= 10) return `${n} أيام`;
  return `${n} يومًا`;
}

function formatGregorian(d: Date): string {
  // التاريخ مخزَّن كمنتصف ليل UTC تمثيلًا ليوم تقويمي،
  // فنقرأ مكوّناته بـ UTC حتى لا ينزلق يومًا للخلف.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}
