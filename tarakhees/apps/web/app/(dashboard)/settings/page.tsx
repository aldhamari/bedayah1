'use client';

// ══════════════════════════════════════════════════════════════
//  الشاشة ٦: الإعدادات — مهل التنبيه · القنوات · المستخدمون
// ══════════════════════════════════════════════════════════════

import { useState } from 'react';
import type { PendingInvite, SessionUser } from '@repo/shared/auth/auth.schema';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from '@/components/ui';
import { api, ApiError, useApi } from '@/lib/api';
import { CHANNEL_LABEL, formatDateTime, offsetLabel, ROLE_LABEL } from '@/lib/format';

type Rule = { id: string; offsetDays: number; channel: string; isActive: boolean };
type Member = {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; email: string; fullName: string; phone: string | null };
};

const CHANNELS = ['EMAIL', 'IN_APP', 'WHATSAPP', 'SMS'] as const;

export default function SettingsPage() {
  const me = useApi<SessionUser>('/auth/me');
  const isOwner = me.data?.role === 'OWNER';

  return (
    <>
      <PageHeader title="الإعدادات" />
      {me.loading ? <Spinner /> : (
        <div className="space-y-8">
          <RemindersSection />
          <MembersSection isOwner={!!isOwner} meId={me.data?.userId} />
        </div>
      )}
    </>
  );
}

// ─────────────── مهل التنبيه والقنوات ───────────────

function RemindersSection() {
  const { data, error, loading, reload } = useApi<Rule[]>('/settings/reminder-rules');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const form = new FormData(e.currentTarget);
    try {
      await api.post('/settings/reminder-rules', {
        offsetDays: Number(form.get('offsetDays')),
        channel: form.get('channel'),
        isActive: true,
      });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'تعذّر الحفظ');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: Rule) {
    await api.post('/settings/reminder-rules', {
      offsetDays: rule.offsetDays,
      channel: rule.channel,
      isActive: !rule.isActive,
    });
    reload();
  }

  async function remove(rule: Rule) {
    try {
      await api.del(`/settings/reminder-rules/${rule.id}`);
      reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'تعذّر الحذف');
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">مهل التنبيه والقنوات</h2>
      <p className="mb-4 text-sm text-slate-600">
        تعمل المهمة الليلية ٧:٠٠ صباحًا بتوقيت الرياض، وتُرسل تنبيهًا واحدًا لكل مهلة —
        فتكرار التشغيل لا يُرسل نفس التنبيه مرتين.
      </p>

      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      {error && <Alert>{error}</Alert>}
      {loading && <Spinner />}

      {data && (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>المهلة</Th>
                <Th>القناة</Th>
                <Th>الحالة</Th>
                <Th>إجراءات</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((rule) => (
                <tr key={rule.id} className={rule.isActive ? '' : 'opacity-60'}>
                  <Td className="font-medium text-slate-900">{offsetLabel(rule.offsetDays)}</Td>
                  <Td className="text-slate-600">{CHANNEL_LABEL[rule.channel] ?? rule.channel}</Td>
                  <Td>
                    <span className={`text-xs font-medium ${rule.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {rule.isActive ? 'مفعّلة' : 'متوقفة'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button tone="secondary" onClick={() => toggle(rule)}>
                        {rule.isActive ? 'أوقف' : 'فعّل'}
                      </Button>
                      <Button tone="ghost" onClick={() => remove(rule)}>احذف</Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          <Card className="mt-4 max-w-2xl">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">أضف مهلة</h3>
            <form onSubmit={save} className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Field label="قبل كم يومًا؟" hint="صفر = يوم الانتهاء">
                  <Input name="offsetDays" type="number" required defaultValue={90} dir="ltr" />
                </Field>
              </div>
              <div className="w-48">
                <Field label="القناة">
                  <Select name="channel" required defaultValue="EMAIL">
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button type="submit" disabled={busy}>{busy ? 'جارٍ…' : 'أضف'}</Button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              واتساب والرسائل النصية تحتاجان تهيئة مزوّد في متغيرات البيئة، وقالبًا معتمدًا
              مسبقًا لدى Meta في حالة واتساب.
            </p>
          </Card>
        </>
      )}
    </section>
  );
}

// ─────────────── المستخدمون والدعوات ───────────────

function MembersSection({ isOwner, meId }: { isOwner: boolean; meId?: string }) {
  const members = useApi<Member[]>('/auth/members');
  const invites = useApi<PendingInvite[]>(isOwner ? '/auth/invitations' : null);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setInviteLink(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await api.post<{ token: string }>('/auth/invitations', {
        email: form.get('email'),
        role: form.get('role'),
      });
      // إرسال الدعوة بالبريد غير مبنيّ بعد — يُنسخ الرابط يدويًا
      setInviteLink(`${window.location.origin}/accept-invite?token=${res.token}`);
      (e.target as HTMLFormElement).reset();
      invites.reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'تعذّرت الدعوة');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    setMsg(null);
    try {
      await api.patch(`/auth/members/${userId}/role`, { role });
      members.reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'تعذّر تغيير الدور');
    }
  }

  async function remove(userId: string) {
    setMsg(null);
    try {
      await api.del(`/auth/members/${userId}`);
      members.reload();
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'تعذّر الإخراج');
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-slate-900">المستخدمون</h2>
      <p className="mb-4 text-sm text-slate-600">
        التنبيهات تصل إلى المالكين والمديرين. المطّلع يقرأ ولا يعدّل.
      </p>

      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      {members.loading && <Spinner />}
      {members.error && <Alert>{members.error}</Alert>}

      {members.data && (
        <TableWrap>
          <thead>
            <tr>
              <Th>الاسم</Th>
              <Th>البريد</Th>
              <Th>الجوال</Th>
              <Th>الدور</Th>
              {isOwner && <Th>إجراءات</Th>}
            </tr>
          </thead>
          <tbody>
            {members.data.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium text-slate-900">
                  {m.user.fullName}
                  {m.user.id === meId && <span className="ms-2 text-xs text-slate-500">(أنت)</span>}
                </Td>
                <Td className="text-slate-600" dir="ltr">{m.user.email}</Td>
                <Td className="text-slate-600" dir="ltr">{m.user.phone ?? '—'}</Td>
                <Td>
                  {isOwner && m.user.id !== meId ? (
                    <Select
                      value={m.role}
                      onChange={(e) => changeRole(m.user.id, e.target.value)}
                      aria-label={`دور ${m.user.fullName}`}
                      className="w-32"
                    >
                      {Object.entries(ROLE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-slate-700">{ROLE_LABEL[m.role] ?? m.role}</span>
                  )}
                </Td>
                {isOwner && (
                  <Td>
                    {m.user.id !== meId && (
                      <Button tone="ghost" onClick={() => remove(m.user.id)}>أخرِج</Button>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {isOwner && (
        <Card className="mt-4 max-w-2xl">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">ادعُ عضوًا</h3>

          <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field label="البريد الإلكتروني">
                <Input name="email" type="email" required dir="ltr" />
              </Field>
            </div>
            <div className="w-40">
              <Field label="الدور">
                <Select name="role" defaultValue="VIEWER">
                  {Object.entries(ROLE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={busy}>{busy ? 'جارٍ…' : 'أنشئ دعوة'}</Button>
          </form>

          {inviteLink && (
            <div className="mt-4">
              <Alert tone="info">
                أُنشئت الدعوة. أرسل هذا الرابط للمدعوّ — صالح سبعة أيام ويُستعمل مرة واحدة:
                <input
                  readOnly
                  dir="ltr"
                  value={inviteLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 w-full rounded border border-sky-200 bg-white px-2 py-1 text-xs"
                />
              </Alert>
            </div>
          )}

          {invites.data && invites.data.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="mb-2 text-xs font-semibold text-slate-600">دعوات معلّقة</h4>
              <ul className="space-y-1 text-sm">
                {invites.data.map((inv, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 text-slate-700">
                    <span dir="ltr">{inv.email}</span>
                    <span className="text-xs text-slate-500">
                      {ROLE_LABEL[inv.role]} · تنتهي {formatDateTime(inv.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
