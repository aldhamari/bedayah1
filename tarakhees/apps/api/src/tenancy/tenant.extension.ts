// ══════════════════════════════════════════════════════════════
//  apps/api/src/tenancy/tenant.extension.ts
//
//  امتداد Prisma Client الذي يحقن `tenantId` في كل استعلام تلقائيًا.
//  هذا هو الشرط غير القابل للتفاوض في CLAUDE.md (المهمة ٣).
//
//  المبدأ: لا يُسمح لأي استعلام على جدول مملوك لمستأجر بأن يخرج من
//  حدود مستأجر الطلب — سواء تذكّر كاتب الاستعلام ذلك أم لا.
// ══════════════════════════════════════════════════════════════

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContextService } from './tenant-context.service';

/**
 * الجداول التي تحمل `tenantId` إلزاميًا.
 * مشتقّة يدويًا من schema.prisma — وثابتة معه في اختبار وحدة
 * (tenant.extension.spec) حتى ينكسر البناء إن أُضيف جدول ونُسي هنا.
 */
export const TENANT_OWNED_MODELS = [
  'Membership',
  'Facility',
  'Person',
  'License',
  'LicensePeriod',
  'Document',
  'ReminderRule',
  'ReminderJob',
  'NotificationLog',
  'RenewalRequest',
  'Subscription',
  'AuditLog',
] as const;

/**
 * `LicenseType` حالة خاصة: `tenantId` فيه اختياري، و null تعني
 * «نوع عام يظهر لكل المستأجرين» (كتالوج البذور الـ27).
 * فالقراءة ترى العام + الخاص، أما الكتابة فمحصورة في الخاص —
 * لا أحد يعدّل الكتالوج العام من خلال واجهة المستأجر.
 */
const SHARED_CATALOG_MODEL = 'LicenseType';

/** جداول بلا مالك: Tenant (المالك نفسه)، User (عابر للمستأجرين)، ServiceProvider (عام) */
const UNSCOPED_MODELS = new Set(['Tenant', 'User', 'ServiceProvider']);

const OWNED = new Set<string>(TENANT_OWNED_MODELS);

/**
 * عمليات ترشيح تقبل `AND` في where.
 */
const FILTER_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

/**
 * عمليات تعمل على صف واحد بمفتاح فريد.
 *
 * ★ `where` هنا لا يقبل `AND` إطلاقًا (Prisma يرفضه بـ Unknown argument)،
 *   لكنه يقبل مرشّحات عادية بجانب المفتاح الفريد منذ Prisma 5
 *   (extendedWhereUnique). فندمج `tenantId` في المستوى الأعلى:
 *   صف من مستأجر آخر لا يطابق، فيعود null أو يرمي P2025.
 */
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);


/** عمليات تُنشئ صفوفًا */
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * يلفّ شرط المستدعي بـ AND بدل الكتابة فوقه.
 * الكتابة فوق `where.tenantId` تبدو أبسط، لكنها تنكسر حين يكون
 * للمستدعي `OR` خاص به (كما في licenses-bulk.service.ts) — فـ AND
 * هو الشكل الوحيد الذي لا يمكن لأي شرط مستدعٍ أن يوسّعه.
 */
function andWhere(where: unknown, scope: object): object {
  if (where && typeof where === 'object' && Object.keys(where).length > 0) {
    return { AND: [where, scope] };
  }
  return scope;
}

export function tenantIsolation(ctx: TenantContextService) {
  return Prisma.defineExtension({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (UNSCOPED_MODELS.has(model)) return query(args);

          const isOwned = OWNED.has(model);
          const isCatalog = model === SHARED_CATALOG_MODEL;
          if (!isOwned && !isCatalog) return query(args);

          const scope = ctx.scope();

          if (scope.mode === 'system') return query(args);

          if (scope.mode === 'blocked') {
            // طلب HTTP بلا هوية لمس جدولًا مملوكًا لمستأجر.
            // هذا خطأ برمجي (مسار نُسي وضع حارس عليه) لا خطأ مستخدم،
            // فنرفضه بصوت عالٍ بدل أن نُعيد بيانات الجميع بصمت.
            throw new ForbiddenException(
              `محاولة الوصول إلى ${model} بلا سياق مستأجر`,
            );
          }

          const { tenantId } = scope;
          const a = (args ?? {}) as Record<string, unknown>;

          const isWrite = operation.startsWith('update') || operation.startsWith('delete');

          /** الكتالوج: القراءة ترى العام + الخاص، والكتابة على الخاص وحده */
          const filter =
            isCatalog && !isWrite ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId };

          // ── ترشيح عادي: AND مقبول ──
          if (FILTER_OPS.has(operation)) {
            a.where = andWhere(a.where, filter);
            return query(a);
          }

          // ── صف واحد بمفتاح فريد ──
          if (UNIQUE_OPS.has(operation)) {
            // قراءة الكتالوج تعني «عام أو خاص بي» — وهذا OR لا يقبله
            // where الفريد. فننفّذ الاستعلام ثم نُسقط الصف إن كان
            // مملوكًا لمستأجر آخر. صف واحد، فالترشيح بعديًا بلا كلفة.
            if (isCatalog && !isWrite) {
              const row = (await query(a)) as { tenantId?: string | null } | null;
              if (row && row.tenantId != null && row.tenantId !== tenantId) {
                if (operation === 'findUniqueOrThrow') {
                  throw new NotFoundException('نوع الترخيص غير موجود');
                }
                return null;
              }
              return row;
            }

            // الدمج بعد شرط المستدعي: لو مرّر tenantId آخر، تغلب قيمتنا.
            a.where = { ...(a.where as object), tenantId };
            return query(a);
          }

          // ── الإنشاء ──
          if (CREATE_OPS.has(operation)) {
            if (operation === 'create') {
              a.data = { ...(a.data as object), tenantId };
            } else {
              const data = a.data;
              a.data = Array.isArray(data)
                ? data.map((row) => ({ ...(row as object), tenantId }))
                : { ...(data as object), tenantId };
            }
            return query(a);
          }

          // ── upsert: ترشيح + إنشاء معًا ──
          // where فيه فريد أيضًا، فالدمج في المستوى الأعلى لا AND.
          if (operation === 'upsert') {
            a.where = { ...(a.where as object), tenantId };
            a.create = { ...(a.create as object), tenantId };
            return query(a);
          }

          return query(a);
        },
      },
    },
  });
}
