'use client';

// ══════════════════════════════════════════════════════════════
//  apps/web/app/(dashboard)/licenses/quick-entry/QuickEntryGrid.tsx
//
//  شاشة الإدخال السريع — الشاشة التي تقرر بقاء العميل أو رحيله.
//  الهدف: من "عندي ١٥ ترخيصًا في ملف إكسل" إلى "كلها في النظام"
//  خلال دقيقتين، بلا نموذج يُملأ خمس عشرة مرة.
// ══════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react';
import {
  parseClipboard,
  parseFlexibleDate,
  dateSanityWarning,
  matchLicenseType,
  type CatalogEntry,
  type TypeMatch,
} from '@/lib/licenses/parsers';

type HolderOption = { id: string; name: string; kind: 'FACILITY' | 'PERSON' };

type Row = {
  key: string;
  typeText: string;
  typeMatch: TypeMatch;
  typeId: string | null;
  holderText: string;
  holderId: string | null;
  number: string;
  dateText: string;
};

type Props = {
  catalog: CatalogEntry[];
  holders: HolderOption[];
  onSaved: (count: number) => void;
};

let seq = 0;
const newRow = (init: Partial<Row> = {}): Row => ({
  key: `r${seq++}`,
  typeText: '',
  typeMatch: null,
  typeId: null,
  holderText: '',
  holderId: null,
  number: '',
  dateText: '',
  ...init,
});

export default function QuickEntryGrid({ catalog, holders, onSaved }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // ── التحقق ──
  const checked = useMemo(
    () =>
      rows.map((row) => {
        const date = row.dateText ? parseFlexibleDate(row.dateText) : null;
        const errors: Partial<Record<'type' | 'holder' | 'date', string>> = {};

        if (!row.typeId) errors.type = 'اختر النوع';
        if (!row.holderId) errors.holder = 'اختر الجهة';
        if (!date) errors.date = 'التاريخ مطلوب';
        else if (!date.ok) errors.date = date.reason;

        const warning = date?.ok ? dateSanityWarning(date.gregorianISO) : null;

        return { row, date, errors, warning, valid: Object.keys(errors).length === 0 };
      }),
    [rows],
  );

  const readyCount = checked.filter((c) => c.valid).length;
  const issueCount = checked.length - readyCount;

  // ── اللصق ──
  function ingest(text: string) {
    const parsed = parseClipboard(text);
    if (parsed.length === 0) return;

    const holderByName = new Map(holders.map((h) => [h.name.trim(), h]));

    const next = parsed.map((cells) => {
      const [typeText = '', holderText = '', number = '', dateText = ''] = cells;
      const match = matchLicenseType(typeText, catalog);
      const holder = holderByName.get(holderText.trim()) ?? null;

      return newRow({
        typeText,
        typeMatch: match,
        // التخمين الضعيف لا يُثبَّت تلقائيًا — يُعرض للمراجعة فقط
        typeId: match && match.confidence !== 'guess' ? match.entry.id : null,
        holderText,
        holderId: holder?.id ?? null,
        number,
        dateText,
      });
    });

    setRows((prev) => [...prev, ...next]);
    if (pasteRef.current) pasteRef.current.value = '';
  }

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function remove(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  // ── الحفظ ──
  async function save() {
    setSaving(true);
    setSaveError(null);

    const payload = checked
      .filter((c) => c.valid && c.date?.ok)
      .map(({ row, date }) => ({
        licenseTypeId: row.typeId!,
        holderId: row.holderId!,
        number: row.number || null,
        expiryDate: (date as { gregorianISO: string }).gregorianISO,
        expiryHijri: (date as { hijriKey: string | null }).hijriKey,
        sourceCalendar: (date as { calendar: string }).calendar,
      }));

    try {
      const res = await fetch('/api/licenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenses: payload }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);

      // نُبقي الصفوف التي لم تُحفظ حتى يكملها المستخدم
      setRows((prev) => prev.filter((r) => !checked.find((c) => c.row.key === r.key)?.valid));
      onSaved(payload.length);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'تعذّر الحفظ');
    } finally {
      setSaving(false);
    }
  }

  // ══════════════ العرض ══════════════

  if (rows.length === 0) {
    return (
      <div dir="rtl" className="mx-auto max-w-2xl py-16">
        <h1 className="text-2xl font-semibold text-slate-900">أضف تراخيصك</h1>
        <p className="mt-2 text-slate-600">
          انسخ الأعمدة من ملف إكسل والصقها هنا. الترتيب المتوقع:
          النوع، الجهة، الرقم، تاريخ الانتهاء.
        </p>

        <textarea
          ref={pasteRef}
          onPaste={(e) => {
            e.preventDefault();
            ingest(e.clipboardData.getData('text'));
          }}
          placeholder="الصق هنا (Ctrl+V)"
          className="mt-6 h-40 w-full resize-none rounded-lg border-2 border-dashed border-slate-300
                     bg-slate-50 p-4 text-slate-700 outline-none
                     focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300"
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setRows([newRow(), newRow(), newRow()])}
            className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50
                       focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            أدخل يدويًا بدلًا من ذلك
          </button>
          <span className="text-sm text-slate-500">
            التاريخ الهجري مقبول ويُحوَّل تلقائيًا
          </span>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="pb-28">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-white shadow-[0_1px_0_theme(colors.slate.200)]">
          <tr className="text-right text-slate-600">
            <th className="w-8 py-3" />
            <th className="py-3 font-medium">نوع الترخيص</th>
            <th className="py-3 font-medium">الجهة أو الشخص</th>
            <th className="py-3 font-medium">الرقم</th>
            <th className="py-3 font-medium">تاريخ الانتهاء</th>
            <th className="w-10 py-3" />
          </tr>
        </thead>

        <tbody>
          {checked.map(({ row, date, errors, warning, valid }, i) => (
            <tr key={row.key} className="border-t border-slate-100 align-top">
              <td className="py-2 text-slate-400">{i + 1}</td>

              {/* النوع */}
              <td className="py-2 pl-3">
                <select
                  value={row.typeId ?? ''}
                  onChange={(e) => update(row.key, { typeId: e.target.value || null })}
                  className={cell(!!errors.type)}
                >
                  <option value="">— اختر —</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>{c.nameAr}</option>
                  ))}
                </select>
                {row.typeMatch?.confidence === 'guess' && !row.typeId && (
                  <button
                    onClick={() => update(row.key, { typeId: row.typeMatch!.entry.id })}
                    className="mt-1 text-xs text-sky-700 underline underline-offset-2"
                  >
                    هل تقصد {row.typeMatch.entry.nameAr}؟
                  </button>
                )}
                {errors.type && <Hint text={errors.type} tone="error" />}
              </td>

              {/* الجهة */}
              <td className="py-2 pl-3">
                <select
                  value={row.holderId ?? ''}
                  onChange={(e) => update(row.key, { holderId: e.target.value || null })}
                  className={cell(!!errors.holder)}
                >
                  <option value="">— اختر —</option>
                  {holders.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
                {errors.holder && row.holderText && (
                  <Hint text={`لا يوجد سجل باسم "${row.holderText}"`} tone="error" />
                )}
                {errors.holder && !row.holderText && <Hint text={errors.holder} tone="error" />}
              </td>

              {/* الرقم */}
              <td className="py-2 pl-3">
                <input
                  value={row.number}
                  onChange={(e) => update(row.key, { number: e.target.value })}
                  className={cell(false)}
                />
              </td>

              {/* التاريخ */}
              <td className="py-2 pl-3">
                <input
                  value={row.dateText}
                  onChange={(e) => update(row.key, { dateText: e.target.value })}
                  placeholder="15/03/2027"
                  className={cell(!!errors.date)}
                />
                {date?.ok && date.calendar === 'HIJRI' && (
                  <Hint text={`هجري ← ${date.gregorianISO} ميلادي`} tone="info" />
                )}
                {errors.date && <Hint text={errors.date} tone="error" />}
                {warning && <Hint text={warning} tone="warn" />}
              </td>

              <td className="py-2">
                <button
                  onClick={() => remove(row.key)}
                  aria-label={`حذف الصف ${i + 1}`}
                  className="rounded px-2 text-slate-400 hover:text-red-600
                             focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={() => setRows((p) => [...p, newRow()])}
        className="mt-3 text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900"
      >
        إضافة صف
      </button>

      {/* شريط الحفظ */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <p className="text-sm text-slate-600">
            {readyCount} جاهز للحفظ
            {issueCount > 0 && <span className="text-amber-700"> · {issueCount} يحتاج مراجعة</span>}
          </p>

          <div className="flex items-center gap-4">
            {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            <button
              onClick={save}
              disabled={readyCount === 0 || saving}
              className="rounded-md bg-slate-900 px-5 py-2 text-white
                         disabled:bg-slate-300 focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              {saving ? 'جارٍ الحفظ…' : `احفظ ${readyCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── عناصر مساعدة ──

function cell(hasError: boolean) {
  return [
    'w-full rounded-md border bg-white px-2 py-1.5 outline-none',
    'focus-visible:ring-2 focus-visible:ring-slate-400',
    hasError ? 'border-red-400' : 'border-slate-300',
  ].join(' ');
}

function Hint({ text, tone }: { text: string; tone: 'error' | 'warn' | 'info' }) {
  const color =
    tone === 'error' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-500';
  return <p className={`mt-1 text-xs ${color}`}>{text}</p>;
}
