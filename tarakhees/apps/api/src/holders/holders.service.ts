// ══════════════════════════════════════════════════════════════
//  apps/api/src/holders/holders.service.ts
//
//  الفروع والأشخاص — حاملو التراخيص.
//
//  ★ رقم الهوية/الإقامة يُشفَّر قبل الحفظ ويُقنَّع في القوائم
//    (القاعدة الثابتة رقم ٤). الرقم الكامل لا يخرج إلا في صفحة
//    الشخص، ولمن له صلاحية OWNER أو MANAGER.
// ══════════════════════════════════════════════════════════════

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FacilityInput, PersonInput } from '@repo/shared/licenses/license.schema';
import { FieldCryptoService } from '../crypto/field-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCryptoService,
  ) {}

  // ─────────────── الفروع ───────────────

  listFacilities(includeInactive = false) {
    return this.prisma.facility.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { licenses: true } } },
    });
  }

  async getFacility(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: {
        licenses: {
          where: { isArchived: false },
          select: {
            id: true,
            number: true,
            status: true,
            currentExpiry: true,
            licenseType: { select: { nameAr: true } },
          },
          orderBy: { currentExpiry: 'asc' },
        },
      },
    });
    if (!facility) throw new NotFoundException('الفرع غير موجود');
    return facility;
  }

  createFacility(input: FacilityInput) {
    return this.prisma.facility.create({ data: input as never });
  }

  async updateFacility(id: string, input: Partial<FacilityInput>) {
    await this.assertFacilityExists(id);
    return this.prisma.facility.update({ where: { id }, data: input });
  }

  /**
   * الحذف تعطيل لا إزالة: الفرع مرتبط بتراخيص وسجل تنبيهات،
   * وحذفه فعليًا يقطع تاريخًا يحتاجه العميل لاحقًا.
   */
  async deactivateFacility(id: string) {
    await this.assertFacilityExists(id);

    const active = await this.prisma.license.count({
      where: { facilityId: id, isArchived: false },
    });
    if (active > 0) {
      throw new BadRequestException(
        `لا يمكن تعطيل الفرع وله ${active} ترخيصًا نشطًا — أرشِف تراخيصه أولًا`,
      );
    }

    return this.prisma.facility.update({ where: { id }, data: { isActive: false } });
  }

  // ─────────────── الأشخاص ───────────────

  async listPersons(includeInactive = false) {
    const rows = await this.prisma.person.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { fullName: 'asc' },
      include: { _count: { select: { licenses: true } } },
    });

    // القوائم ترى آخر أربعة أرقام فقط
    return rows.map((p) => ({ ...p, nationalId: this.crypto.mask(p.nationalId) }));
  }

  async getPerson(id: string, revealNationalId: boolean) {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        licenses: {
          where: { isArchived: false },
          select: {
            id: true,
            number: true,
            status: true,
            currentExpiry: true,
            licenseType: { select: { nameAr: true } },
          },
          orderBy: { currentExpiry: 'asc' },
        },
      },
    });
    if (!person) throw new NotFoundException('الشخص غير موجود');

    return {
      ...person,
      nationalId: revealNationalId
        ? this.crypto.decrypt(person.nationalId)
        : this.crypto.mask(person.nationalId),
    };
  }

  async createPerson(input: PersonInput) {
    const created = await this.prisma.person.create({
      data: { ...input, nationalId: this.crypto.encrypt(input.nationalId) } as never,
    });
    return { ...created, nationalId: this.crypto.mask(created.nationalId) };
  }

  async updatePerson(id: string, input: Partial<PersonInput>) {
    await this.assertPersonExists(id);

    const updated = await this.prisma.person.update({
      where: { id },
      data: {
        ...input,
        // undefined = لم يُرسَل الحقل فلا نمسّه؛ null = طلب مسحه
        ...(input.nationalId !== undefined
          ? { nationalId: this.crypto.encrypt(input.nationalId) }
          : {}),
      },
    });

    return { ...updated, nationalId: this.crypto.mask(updated.nationalId) };
  }

  async deactivatePerson(id: string) {
    await this.assertPersonExists(id);

    const active = await this.prisma.license.count({
      where: { personId: id, isArchived: false },
    });
    if (active > 0) {
      throw new BadRequestException(
        `لا يمكن تعطيل الشخص وله ${active} ترخيصًا نشطًا — أرشِف تراخيصه أولًا`,
      );
    }

    return this.prisma.person.update({ where: { id }, data: { isActive: false } });
  }

  // ─────────────── أدوات ───────────────
  //
  // الوجود يُتحقَّق منه صراحةً قبل التعديل: امتداد العزل يجعل سجل
  // مستأجر آخر «غير موجود»، فنُعيد 404 عربية بدل خطأ Prisma خام.

  private async assertFacilityExists(id: string) {
    const found = await this.prisma.facility.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('الفرع غير موجود');
  }

  private async assertPersonExists(id: string) {
    const found = await this.prisma.person.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException('الشخص غير موجود');
  }
}
