'use client';

// ══════════════════════════════════════════════════════════════
//  apps/web/components/ui.tsx
//
//  مكوّنات أساسية مشتركة. كلها RTL بطبيعتها لأن الجذر dir="rtl"،
//  فنتجنّب left/right ونستعمل start/end حيث يلزم.
// ══════════════════════════════════════════════════════════════

import Link from 'next/link';
import { ReactNode } from 'react';
import {
  formatDaysLeft,
  formatGregorian,
  formatHijri,
  STATUS_LABEL,
  STATUS_TONE,
  type LicenseStatus,
} from '@/lib/format';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const BUTTON_TONES = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function Button({
  children,
  tone = 'primary',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BUTTON_TONES }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm
        font-medium transition disabled:cursor-not-allowed disabled:opacity-50
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-slate-900 ${BUTTON_TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} ${props.className ?? ''}`} />;
}

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset
        ${STATUS_TONE[status] ?? STATUS_TONE.CANCELLED}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * القاعدة الثابتة رقم ٣: الميلادي والهجري معًا حين يتوفر الهجري.
 * هذا المكوّن هو المكان الوحيد الذي تُعرض منه تواريخ الانتهاء.
 */
export function DateCell({
  gregorian,
  hijri,
  daysLeft,
}: {
  gregorian: string | Date | null | undefined;
  hijri?: string | null;
  daysLeft?: number | null;
}) {
  const h = formatHijri(hijri);
  return (
    <div className="leading-tight">
      <div className="text-sm text-slate-900">{formatGregorian(gregorian)}</div>
      {h && <div className="text-xs text-slate-500">{h}</div>}
      {daysLeft !== undefined && (
        <div className={`text-xs ${daysLeft !== null && daysLeft < 0 ? 'text-red-600' : 'text-slate-500'}`}>
          {formatDaysLeft(daysLeft)}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <p className="text-base font-medium text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'warning' | 'success' | 'info';
  children: ReactNode;
}) {
  const tones = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
  };
  return (
    <div role="alert" className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
      />
      <span>{label}</span>
    </div>
  );
}

/** جدول يمرّر أفقيًا داخل حاويته بدل أن يكسر تخطيط الصفحة */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[42rem] text-start text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-start text-xs font-semibold text-slate-600">
      {children}
    </th>
  );
}

/**
 * يقبل بقية خصائص <td> — أهمها `dir="ltr"` للمحتوى اللاتيني
 * (بريد، أرقام سجلات، جوالات) داخل صفحة RTL: بدونها يقفز الترقيم
 * والعلامات إلى الطرف الخطأ ويصير الرقم غير قابل للقراءة.
 */
export function Td({
  children,
  className = '',
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { children: ReactNode }) {
  return (
    <td {...rest} className={`border-b border-slate-100 px-4 py-3 align-top ${className}`}>
      {children}
    </td>
  );
}

export function LinkButton({
  href,
  children,
  tone = 'secondary',
}: {
  href: string;
  children: ReactNode;
  tone?: keyof typeof BUTTON_TONES;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm
        font-medium transition ${BUTTON_TONES[tone]}`}
    >
      {children}
    </Link>
  );
}
