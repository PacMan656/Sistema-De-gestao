import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { InventoryValidationError } from './inventory.ts';
import {
  assetMovements,
  chatMessages,
  departments,
  equipments,
  incidents,
  inspections,
  remoteSessions,
  users,
} from '../db/schema.ts';
import type {
  CheckinMovementInput,
  CheckoutMovementInput,
  CreateIncidentInput,
  OnboardingInput,
  UserRole,
} from '../shared/validation.ts';

function wrapDbError(context: string, error: unknown): Error {
  const cause = error instanceof Error ? error.cause : undefined;
  const detail = cause instanceof Error ? cause.message : error instanceof Error ? error.message : '';
  if (error instanceof InventoryValidationError) return error;
  if (detail.startsWith('Vinculo:')) return new InventoryValidationError(detail.replace('Vinculo:', '').trim());
  console.error(`[DB Error] ${context}:`, error);
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  ) {
    return new Error('Registro duplicado: Patrimônio ou Número de Série já cadastrado.', {
      cause: error,
    });
  }
  return new Error('Falha ao processar operação no banco de dados.', { cause: error });
}

export async function getUserWithDepartment(userId: number) {
  try {
    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        fullName: users.fullName,
        matricula: users.matricula,
        jobTitle: users.jobTitle,
        role: users.role,
        departmentId: users.departmentId,
        onboardingCompleted: users.onboardingCompleted,
        active: users.active,
        authVersion: users.authVersion,
        sectorAccount: users.sectorAccount,
        departmentName: departments.name,
        departmentCode: departments.code,
        departmentLocation: departments.location,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    throw wrapDbError('getUserWithDepartment', error);
  }
}

export async function completeUserOnboarding(userId: number, input: OnboardingInput) {
  try {
    const updated = await db
      .update(users)
      .set({
        fullName: input.fullName,
        matricula: input.matricula,
        jobTitle: input.jobTitle,
        departmentId: input.departmentId,
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated[0];
  } catch (error) {
    throw wrapDbError('completeUserOnboarding', error);
  }
}

export async function listDepartments() {
  try {
    return await db.select().from(departments).orderBy(departments.name);
  } catch (error) {
    throw wrapDbError('listDepartments', error);
  }
}

export async function listUsers() {
  try {
    return await db
      .select({
        id: users.id,
        uid: users.uid,
        email: users.email,
        fullName: users.fullName,
        matricula: users.matricula,
        jobTitle: users.jobTitle,
        role: users.role,
        departmentId: users.departmentId,
        onboardingCompleted: users.onboardingCompleted,
        active: users.active,
        departmentName: departments.name,
        departmentCode: departments.code,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .orderBy(users.fullName);
  } catch (error) {
    throw wrapDbError('listUsers', error);
  }
}

export async function updateUserRoleAndDepartment(
  userId: number,
  role: UserRole,
  departmentId: number
) {
  try {
    const updated = await db
      .update(users)
      .set({ role, departmentId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    throw wrapDbError('updateUserRoleAndDepartment', error);
  }
}

export interface EquipmentFilter {
  search?: string;
  status?: string;
  departmentId?: number;
  ownershipType?: string;
  equipmentType?: string;
}

export async function listEquipments(filter: EquipmentFilter = {}) {
  try {
    const conditions = [];

    if (filter.status && filter.status !== 'Todos') {
      conditions.push(eq(equipments.operationalStatus, filter.status));
    }
    if (filter.departmentId) {
      conditions.push(eq(equipments.departmentId, filter.departmentId));
    }
    if (filter.ownershipType && filter.ownershipType !== 'Todos') {
      conditions.push(eq(equipments.ownershipType, filter.ownershipType));
    }
    if (filter.equipmentType && filter.equipmentType !== 'Todos') {
      conditions.push(eq(equipments.equipmentType, filter.equipmentType));
    }
    if (filter.search && filter.search.trim()) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(equipments.assetTag, q),
          ilike(equipments.serialNumber, q),
          ilike(equipments.brand, q),
          ilike(equipments.model, q),
          ilike(equipments.currentHolderName, q)
        )
      );
    }

    const query = db
      .select({
        id: equipments.id,
        assetTag: equipments.assetTag,
        serialNumber: equipments.serialNumber,
        equipmentType: equipments.equipmentType,
        brand: equipments.brand,
        model: equipments.model,
        departmentId: equipments.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        responsibleCompany: equipments.responsibleCompany,
        parentEquipmentId: equipments.parentEquipmentId,
        ownershipType: equipments.ownershipType,
        contractNumber: equipments.contractNumber,
        supplierName: equipments.supplierName,
        contractEndDate: equipments.contractEndDate,
        operationalStatus: equipments.operationalStatus,
        currentHolderName: equipments.currentHolderName,
        currentHolderDocument: equipments.currentHolderDocument,
        currentHolderRole: equipments.currentHolderRole,
        manufactureYear: equipments.manufactureYear,
        lastInspectionDate: equipments.lastInspectionDate,
        nextInspectionDate: equipments.nextInspectionDate,
        accessories: equipments.accessories,
        notes: equipments.notes,
        connectionInterface: equipments.connectionInterface,
        networkAddress: equipments.networkAddress,
        portNumber: equipments.portNumber,
        connectionStatus: equipments.connectionStatus,
        createdAt: equipments.createdAt,
        updatedAt: equipments.updatedAt,
      })
      .from(equipments)
      .leftJoin(departments, eq(equipments.departmentId, departments.id));

    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(equipments.updatedAt));
    }
    return await query.orderBy(desc(equipments.updatedAt));
  } catch (error) {
    throw wrapDbError('listEquipments', error);
  }
}

export async function getEquipmentDetail(id: number) {
  try {
    const rows = await db
      .select({
        id: equipments.id,
        assetTag: equipments.assetTag,
        serialNumber: equipments.serialNumber,
        equipmentType: equipments.equipmentType,
        brand: equipments.brand,
        model: equipments.model,
        departmentId: equipments.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        departmentLocation: departments.location,
        responsibleCompany: equipments.responsibleCompany,
        parentEquipmentId: equipments.parentEquipmentId,
        ownershipType: equipments.ownershipType,
        contractNumber: equipments.contractNumber,
        supplierName: equipments.supplierName,
        contractEndDate: equipments.contractEndDate,
        operationalStatus: equipments.operationalStatus,
        currentHolderName: equipments.currentHolderName,
        currentHolderDocument: equipments.currentHolderDocument,
        currentHolderRole: equipments.currentHolderRole,
        manufactureYear: equipments.manufactureYear,
        lastInspectionDate: equipments.lastInspectionDate,
        nextInspectionDate: equipments.nextInspectionDate,
        accessories: equipments.accessories,
        notes: equipments.notes,
        connectionInterface: equipments.connectionInterface,
        networkAddress: equipments.networkAddress,
        portNumber: equipments.portNumber,
        connectionStatus: equipments.connectionStatus,
        createdAt: equipments.createdAt,
        updatedAt: equipments.updatedAt,
      })
      .from(equipments)
      .leftJoin(departments, eq(equipments.departmentId, departments.id))
      .where(eq(equipments.id, id))
      .limit(1);

    if (rows.length === 0) return null;

    const movements = await db
      .select({
        id: assetMovements.id,
        equipmentId: assetMovements.equipmentId,
        movementType: assetMovements.movementType,
        previousStatus: assetMovements.previousStatus,
        newStatus: assetMovements.newStatus,
        fromDepartmentId: assetMovements.fromDepartmentId,
        toDepartmentId: assetMovements.toDepartmentId,
        collaboratorName: assetMovements.collaboratorName,
        collaboratorDocument: assetMovements.collaboratorDocument,
        collaboratorRole: assetMovements.collaboratorRole,
        collaboratorDepartment: assetMovements.collaboratorDepartment,
        reason: assetMovements.reason,
        conditionState: assetMovements.conditionState,
        accessoriesIncluded: assetMovements.accessoriesIncluded,
        notes: assetMovements.notes,
        termNumber: assetMovements.termNumber,
        occurredAt: assetMovements.occurredAt,
        performedByName: users.fullName,
      })
      .from(assetMovements)
      .leftJoin(users, eq(assetMovements.performedById, users.id))
      .where(eq(assetMovements.equipmentId, id))
      .orderBy(desc(assetMovements.occurredAt));

    const assetInspections = await db
      .select({
        id: inspections.id,
        equipmentId: inspections.equipmentId,
        movementId: inspections.movementId,
        inspectionDate: inspections.inspectionDate,
        nextInspectionDate: inspections.nextInspectionDate,
        physicalCondition: inspections.physicalCondition,
        checklistJson: inspections.checklistJson,
        findings: inspections.findings,
        approvedForUse: inspections.approvedForUse,
        createdAt: inspections.createdAt,
        inspectorName: users.fullName,
      })
      .from(inspections)
      .leftJoin(users, eq(inspections.inspectorId, users.id))
      .where(eq(inspections.equipmentId, id))
      .orderBy(desc(inspections.createdAt));

    const linkedEquipments = await db.select().from(equipments).where(eq(equipments.parentEquipmentId, id));
    const [parentEquipment] = rows[0].parentEquipmentId
      ? await db.select().from(equipments).where(eq(equipments.id, rows[0].parentEquipmentId)) : [];
    return {
      equipment: { ...rows[0], linkedEquipmentIds: linkedEquipments.map((row) => row.id) },
      linkedEquipments,
      parentEquipment: parentEquipment ?? null,
      movements,
      inspections: assetInspections,
    };
  } catch (error) {
    throw wrapDbError('getEquipmentDetail', error);
  }
}

export async function findEquipmentByBarcode(code: string) {
  try {
    const normalized = code.trim().toUpperCase();
    const rows = await db
      .select({
        id: equipments.id,
        assetTag: equipments.assetTag,
        serialNumber: equipments.serialNumber,
        equipmentType: equipments.equipmentType,
        brand: equipments.brand,
        model: equipments.model,
        departmentId: equipments.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        operationalStatus: equipments.operationalStatus,
      })
      .from(equipments)
      .leftJoin(departments, eq(equipments.departmentId, departments.id))
      .where(
        or(
          eq(equipments.assetTag, normalized),
          eq(equipments.serialNumber, normalized)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    throw wrapDbError('findEquipmentByBarcode', error);
  }
}

export async function updateEquipmentConnectionStatus(
  equipmentId: number,
  connectionStatus: 'Conectado' | 'Desconectado' | 'Não Verificado'
) {
  try {
    await db
      .update(equipments)
      .set({ connectionStatus, updatedAt: new Date() })
      .where(eq(equipments.id, equipmentId));
  } catch (error) {
    throw wrapDbError('updateEquipmentConnectionStatus', error);
  }
}

export async function createRemoteSessionLog(params: {
  equipmentId: number;
  technicianId: number;
  actionType: 'DIAGNOSTICO_REMOTO' | 'IMPRESSAO_TESTE' | 'VERIFICACAO_USB';
  connectionInterface: string;
  targetAddress: string | null;
  resultStatus: 'Sucesso' | 'Alerta' | 'Indisponível';
  details: string;
  latencyMs?: number | null;
}) {
  try {
    const [inserted] = await db
      .insert(remoteSessions)
      .values({
        equipmentId: params.equipmentId,
        technicianId: params.technicianId,
        actionType: params.actionType,
        connectionInterface: params.connectionInterface,
        targetAddress: params.targetAddress,
        resultStatus: params.resultStatus,
        details: params.details,
        latencyMs: params.latencyMs ?? null,
      })
      .returning();
    return inserted;
  } catch (error) {
    throw wrapDbError('createRemoteSessionLog', error);
  }
}

export async function listRemoteSessions(equipmentId: number, limitCount = 15) {
  try {
    return await db
      .select({
        id: remoteSessions.id,
        equipmentId: remoteSessions.equipmentId,
        actionType: remoteSessions.actionType,
        connectionInterface: remoteSessions.connectionInterface,
        targetAddress: remoteSessions.targetAddress,
        resultStatus: remoteSessions.resultStatus,
        details: remoteSessions.details,
        latencyMs: remoteSessions.latencyMs,
        createdAt: remoteSessions.createdAt,
        technicianName: users.fullName,
      })
      .from(remoteSessions)
      .leftJoin(users, eq(remoteSessions.technicianId, users.id))
      .where(eq(remoteSessions.equipmentId, equipmentId))
      .orderBy(desc(remoteSessions.createdAt))
      .limit(limitCount);
  } catch (error) {
    throw wrapDbError('listRemoteSessions', error);
  }
}

export async function listEquipmentIncidents(equipmentId: number) {
  try {
    return await db
      .select({
        id: incidents.id,
        ticketCode: incidents.ticketCode,
        title: incidents.title,
        priority: incidents.priority,
        status: incidents.status,
        createdAt: incidents.createdAt,
      })
      .from(incidents)
      .where(eq(incidents.equipmentId, equipmentId))
      .orderBy(desc(incidents.createdAt));
  } catch (error) {
    throw wrapDbError('listEquipmentIncidents', error);
  }
}

export async function registerCheckoutMovement(
  input: CheckoutMovementInput,
  performedById: number
) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE equipments IN EXCLUSIVE MODE`);
      const equipRows = await tx
        .select()
        .from(equipments)
        .where(eq(equipments.id, input.equipmentId))
        .limit(1);

      if (equipRows.length === 0) {
        throw new Error('EQUIPAMENTO_NAO_ENCONTRADO');
      }
      const equip = equipRows[0];
      if (equip.departmentId !== input.toDepartmentId) {
        const children = await tx.select({ id: equipments.id }).from(equipments).where(eq(equipments.parentEquipmentId, equip.id)).limit(1);
        if (equip.parentEquipmentId || children.length) throw new InventoryValidationError('Desvincule os equipamentos antes de transferir o ativo para outro setor.');
      }
      if (equip.operationalStatus !== 'Disponível') {
        throw new Error('EQUIPAMENTO_INDISPONIVEL');
      }

      const deptRows = await tx
        .select()
        .from(departments)
        .where(eq(departments.id, input.toDepartmentId))
        .limit(1);
      if (deptRows.length === 0) {
        throw new Error('SETOR_NAO_ENCONTRADO');
      }

      const [sectorAccess] = await tx.select({ id: users.id }).from(users).where(and(eq(users.departmentId, input.toDepartmentId), eq(users.sectorAccount, true)));
      if (!sectorAccess) throw new InventoryValidationError('Configure o acesso do setor de destino antes da movimentação.');

      const year = new Date().getFullYear();
      const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
      const termNumber = `TRM-${year}-${randSuffix}`;

      const [movement] = await tx
        .insert(assetMovements)
        .values({
          equipmentId: equip.id,
          movementType: 'SAIDA',
          previousStatus: equip.operationalStatus,
          newStatus: 'Em Uso',
          fromDepartmentId: equip.departmentId,
          toDepartmentId: input.toDepartmentId,
          collaboratorName: input.collaboratorName,
          collaboratorDocument: input.collaboratorDocument,
          collaboratorRole: input.collaboratorRole,
          collaboratorDepartment: deptRows[0].name,
          reason: input.reason,
          conditionState: input.conditionState,
          accessoriesIncluded: input.accessoriesIncluded || equip.accessories || 'Padrão',
          notes: input.notes || null,
          termNumber,
          performedById,
        })
        .returning();

      const [updatedEquipment] = await tx
        .update(equipments)
        .set({
          operationalStatus: 'Em Uso',
          departmentId: input.toDepartmentId,
          currentHolderName: input.collaboratorName,
          currentHolderDocument: input.collaboratorDocument,
          currentHolderRole: input.collaboratorRole,
          accessories: input.accessoriesIncluded || equip.accessories,
          updatedAt: new Date(),
        })
        .where(eq(equipments.id, equip.id))
        .returning();

      return { movement, equipment: updatedEquipment };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('EQUIPAMENTO_')) {
      throw error;
    }
    throw wrapDbError('registerCheckoutMovement', error);
  }
}

export async function registerCheckinMovement(
  input: CheckinMovementInput,
  performedById: number
) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE equipments IN EXCLUSIVE MODE`);
      const equipRows = await tx
        .select()
        .from(equipments)
        .where(eq(equipments.id, input.equipmentId))
        .limit(1);

      if (equipRows.length === 0) {
        throw new Error('EQUIPAMENTO_NAO_ENCONTRADO');
      }
      const equip = equipRows[0];
      if (equip.departmentId !== input.toDepartmentId) {
        const children = await tx.select({ id: equipments.id }).from(equipments).where(eq(equipments.parentEquipmentId, equip.id)).limit(1);
        if (equip.parentEquipmentId || children.length) throw new InventoryValidationError('Desvincule os equipamentos antes de transferir o ativo para outro setor.');
      }

      const deptRows = await tx
        .select()
        .from(departments)
        .where(eq(departments.id, input.toDepartmentId))
        .limit(1);
      if (deptRows.length === 0) {
        throw new Error('SETOR_NAO_ENCONTRADO');
      }

      const [sectorAccess] = await tx.select({ id: users.id }).from(users).where(and(eq(users.departmentId, input.toDepartmentId), eq(users.sectorAccount, true)));
      if (!sectorAccess) throw new InventoryValidationError('Configure o acesso do setor de destino antes da movimentação.');

      const todayIso = new Date().toISOString().slice(0, 10);

      const [movement] = await tx
        .insert(assetMovements)
        .values({
          equipmentId: equip.id,
          movementType: 'ENTRADA',
          previousStatus: equip.operationalStatus,
          newStatus: input.targetStatus,
          fromDepartmentId: equip.departmentId,
          toDepartmentId: input.toDepartmentId,
          collaboratorName: input.collaboratorName,
          collaboratorDocument: input.collaboratorDocument,
          collaboratorRole: input.collaboratorRole,
          collaboratorDepartment: deptRows[0].name,
          reason: input.reason,
          conditionState: input.conditionState,
          accessoriesIncluded: equip.accessories,
          notes: input.notes || null,
          performedById,
        })
        .returning();

      const [inspection] = await tx
        .insert(inspections)
        .values({
          equipmentId: equip.id,
          movementId: movement.id,
          inspectorId: performedById,
          inspectionDate: todayIso,
          nextInspectionDate: input.nextInspectionDate || null,
          physicalCondition: input.conditionState,
          checklistJson: input.checklist,
          findings: input.notes || null,
          approvedForUse: input.targetStatus === 'Disponível',
        })
        .returning();

      const [updatedEquipment] = await tx
        .update(equipments)
        .set({
          operationalStatus: input.targetStatus,
          departmentId: input.toDepartmentId,
          currentHolderName: null,
          currentHolderDocument: null,
          currentHolderRole: null,
          lastInspectionDate: todayIso,
          nextInspectionDate: input.nextInspectionDate || equip.nextInspectionDate,
          notes: input.notes
            ? `${equip.notes ? equip.notes + ' | ' : ''}[Vistoria ${todayIso}]: ${input.notes}`
            : equip.notes,
          updatedAt: new Date(),
        })
        .where(eq(equipments.id, equip.id))
        .returning();

      return { movement, inspection, equipment: updatedEquipment };
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('EQUIPAMENTO_')) {
      throw error;
    }
    throw wrapDbError('registerCheckinMovement', error);
  }
}

export async function listMovements(limitCount = 50) {
  try {
    return await db
      .select({
        id: assetMovements.id,
        equipmentId: assetMovements.equipmentId,
        assetTag: equipments.assetTag,
        equipmentBrand: equipments.brand,
        equipmentModel: equipments.model,
        movementType: assetMovements.movementType,
        previousStatus: assetMovements.previousStatus,
        newStatus: assetMovements.newStatus,
        collaboratorName: assetMovements.collaboratorName,
        collaboratorDocument: assetMovements.collaboratorDocument,
        collaboratorRole: assetMovements.collaboratorRole,
        collaboratorDepartment: assetMovements.collaboratorDepartment,
        reason: assetMovements.reason,
        conditionState: assetMovements.conditionState,
        termNumber: assetMovements.termNumber,
        occurredAt: assetMovements.occurredAt,
        performedByName: users.fullName,
      })
      .from(assetMovements)
      .innerJoin(equipments, eq(assetMovements.equipmentId, equipments.id))
      .leftJoin(users, eq(assetMovements.performedById, users.id))
      .orderBy(desc(assetMovements.occurredAt))
      .limit(limitCount);
  } catch (error) {
    throw wrapDbError('listMovements', error);
  }
}

export async function getMovementForTermPdf(movementId: number) {
  try {
    const rows = await db
      .select({
        movement: assetMovements,
        equipment: equipments,
        technicianName: users.fullName,
        technicianMatricula: users.matricula,
        technicianEmail: users.email,
      })
      .from(assetMovements)
      .innerJoin(equipments, eq(assetMovements.equipmentId, equipments.id))
      .innerJoin(users, eq(assetMovements.performedById, users.id))
      .where(eq(assetMovements.id, movementId))
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    throw wrapDbError('getMovementForTermPdf', error);
  }
}

export async function listIncidents(departmentId?: number) {
  try {
    const baseQuery = db
      .select({
        id: incidents.id,
        ticketCode: incidents.ticketCode,
        title: incidents.title,
        description: incidents.description,
        priority: incidents.priority,
        status: incidents.status,
        departmentId: incidents.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        departmentLocation: departments.location,
        requesterId: incidents.requesterId,
        requesterName: users.fullName,
        requesterEmail: users.email,
        assignedTechnicianId: incidents.assignedTechnicianId,
        equipmentId: incidents.equipmentId,
        equipmentAssetTag: equipments.assetTag,
        equipmentModel: equipments.model,
        createdAt: incidents.createdAt,
        updatedAt: incidents.updatedAt,
        resolvedAt: incidents.resolvedAt,
      })
      .from(incidents)
      .innerJoin(departments, eq(incidents.departmentId, departments.id))
      .innerJoin(users, eq(incidents.requesterId, users.id))
      .leftJoin(equipments, eq(incidents.equipmentId, equipments.id));

    if (departmentId) {
      return await baseQuery
        .where(eq(incidents.departmentId, departmentId))
        .orderBy(desc(incidents.createdAt));
    }
    return await baseQuery.orderBy(desc(incidents.createdAt));
  } catch (error) {
    throw wrapDbError('listIncidents', error);
  }
}

export async function createIncident(
  input: CreateIncidentInput,
  requesterId: number,
  departmentId: number
) {
  try {
    if (input.equipmentId) {
      const [equipment] = await db.select({ departmentId: equipments.departmentId }).from(equipments).where(eq(equipments.id, input.equipmentId));
      if (!equipment || equipment.departmentId !== departmentId) throw new InventoryValidationError('Selecione um equipamento pertencente ao setor do chamado.');
    }
    const year = new Date().getFullYear();
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const ticketCode = `INC-${year}-${suffix}`;

    const [created] = await db
      .insert(incidents)
      .values({
        ticketCode,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: 'Aberto',
        departmentId,
        requesterId,
        equipmentId: input.equipmentId ?? null,
      })
      .returning();

    const rows = await listIncidents(departmentId);
    return rows.find((r) => r.id === created.id) ?? null;
  } catch (error) {
    throw wrapDbError('createIncident', error);
  }
}

export async function updateIncidentStatus(
  incidentId: number,
  status: 'Aberto' | 'Em Atendimento' | 'Resolvido',
  technicianId: number
) {
  try {
    const [updated] = await db
      .update(incidents)
      .set({
        status,
        assignedTechnicianId: technicianId,
        updatedAt: new Date(),
        resolvedAt: status === 'Resolvido' ? new Date() : null,
      })
      .where(eq(incidents.id, incidentId))
      .returning();

    if (!updated) return null;
    const rows = await listIncidents(updated.departmentId);
    return rows.find((r) => r.id === updated.id) ?? null;
  } catch (error) {
    throw wrapDbError('updateIncidentStatus', error);
  }
}

export async function listChatMessages(departmentId: number, limitCount = 80) {
  try {
    const rows = await db
      .select({
        id: chatMessages.id,
        departmentId: chatMessages.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        incidentId: chatMessages.incidentId,
        senderId: chatMessages.senderId,
        senderName: users.fullName,
        senderRole: users.role,
        messageType: chatMessages.messageType,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .innerJoin(departments, eq(chatMessages.departmentId, departments.id))
      .where(eq(chatMessages.departmentId, departmentId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limitCount);

    return rows.reverse();
  } catch (error) {
    throw wrapDbError('listChatMessages', error);
  }
}

export async function createChatMessage(params: {
  departmentId: number;
  senderId: number;
  content: string;
  incidentId?: number | null;
  messageType?: 'CHAT' | 'INCIDENT_ALERT' | 'STATUS_CHANGE';
}) {
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({
        departmentId: params.departmentId,
        senderId: params.senderId,
        content: params.content,
        incidentId: params.incidentId ?? null,
        messageType: params.messageType ?? 'CHAT',
      })
      .returning();

    const rows = await db
      .select({
        id: chatMessages.id,
        departmentId: chatMessages.departmentId,
        departmentName: departments.name,
        departmentCode: departments.code,
        incidentId: chatMessages.incidentId,
        senderId: chatMessages.senderId,
        senderName: users.fullName,
        senderRole: users.role,
        messageType: chatMessages.messageType,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .innerJoin(departments, eq(chatMessages.departmentId, departments.id))
      .where(eq(chatMessages.id, inserted.id))
      .limit(1);

    return rows[0];
  } catch (error) {
    throw wrapDbError('createChatMessage', error);
  }
}
