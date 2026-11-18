import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { departments, equipments, users } from './schema.ts';
import type { EquipmentFormInput } from '../shared/validation.ts';

export class InventoryValidationError extends Error {}
export const isComputer = (type: string) => type === 'Desktop' || type === 'Notebook';

export async function saveInventoryEquipment(input: EquipmentFormInput, actorId: number, id?: number) {
  return db.transaction(async (tx) => {
    // Serialize changes to links, including simultaneous edits of a workstation.
    await tx.execute(sql`LOCK TABLE equipments IN EXCLUSIVE MODE`);
    const [department] = await tx.select({ id: departments.id }).from(departments)
      .innerJoin(users, and(eq(users.departmentId, departments.id), eq(users.sectorAccount, true)))
      .where(eq(departments.id, input.departmentId));
    if (!department) throw new InventoryValidationError('Cadastre o setor e configure seu acesso antes de vincular equipamentos.');
    const [previous] = id ? await tx.select().from(equipments).where(eq(equipments.id, id)) : [];
    if (id && !previous) return null;
    const children = id ? await tx.select().from(equipments).where(eq(equipments.parentEquipmentId, id)) : [];
    const parentId = input.parentEquipmentId === undefined ? previous?.parentEquipmentId ?? null : input.parentEquipmentId;
    const linkedIds = input.linkedEquipmentIds === undefined ? children.map((row) => row.id) : [...new Set(input.linkedEquipmentIds)];
    if (parentId) {
      const [parent] = await tx.select().from(equipments).where(eq(equipments.id, parentId));
      if (!parent || !isComputer(parent.equipmentType) || isComputer(input.equipmentType) || parentId === id) throw new InventoryValidationError('O equipamento principal deve ser um desktop ou notebook diferente deste ativo.');
      if (parent.departmentId !== input.departmentId) throw new InventoryValidationError('O equipamento e o computador devem pertencer ao mesmo setor.');
    }
    if (linkedIds.length && !isComputer(input.equipmentType)) throw new InventoryValidationError('Somente desktops e notebooks podem receber equipamentos vinculados.');
    const selected = linkedIds.length ? await tx.select().from(equipments).where(inArray(equipments.id, linkedIds)) : [];
    if (selected.length !== linkedIds.length || selected.some((row) => row.id === id || isComputer(row.equipmentType) || row.departmentId !== input.departmentId || (row.parentEquipmentId !== null && row.parentEquipmentId !== id))) {
      throw new InventoryValidationError('Selecione equipamentos do mesmo setor, sem vínculo com outro computador.');
    }
    // Unlink explicitly removed children before changing the workstation's type or sector.
    for (const child of children) if (!linkedIds.includes(child.id)) await tx.update(equipments).set({ parentEquipmentId: null, updatedAt: new Date() }).where(eq(equipments.id, child.id));
    const { linkedEquipmentIds: _links, parentEquipmentId: _parent, ...fields } = input;
    const values = {
      ...fields, assetTag: input.assetTag.toUpperCase(), serialNumber: input.serialNumber.toUpperCase(),
      parentEquipmentId: parentId,
      contractNumber: input.ownershipType === 'Próprio' ? null : input.contractNumber || null,
      supplierName: input.ownershipType === 'Próprio' ? null : input.supplierName || null,
      contractEndDate: input.ownershipType === 'Próprio' ? null : input.contractEndDate || null,
      lastInspectionDate: input.lastInspectionDate || null, nextInspectionDate: input.nextInspectionDate || null,
      accessories: input.accessories || null, notes: input.notes || null, networkAddress: input.networkAddress || null,
      portNumber: input.portNumber ?? null, updatedAt: new Date(),
    };
    const [saved] = id
      ? await tx.update(equipments).set(values).where(eq(equipments.id, id)).returning()
      : await tx.insert(equipments).values({ ...values, createdById: actorId }).returning();
    for (const child of selected) await tx.update(equipments).set({ parentEquipmentId: saved.id, updatedAt: new Date() }).where(eq(equipments.id, child.id));
    return { ...saved, linkedEquipmentIds: linkedIds };
  });
}
