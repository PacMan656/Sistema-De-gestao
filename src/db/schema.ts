import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  type AnyPgColumn,
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(),
  location: text('location').notNull(),
  costCenter: text('cost_center'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    authVersion: integer('auth_version').default(0).notNull(),
    sectorAccount: boolean('sector_account').default(false).notNull(),
    fullName: text('full_name').notNull(),
    matricula: text('matricula'),
    jobTitle: text('job_title'),
    role: text('role').notNull().default('colaborador'), // 'admin_ti' | 'colaborador'
    departmentId: integer('department_id').references(() => departments.id),
    onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('idx_users_department').on(table.departmentId), uniqueIndex('idx_users_email_unique').on(sql`lower(${table.email})`), uniqueIndex('idx_sector_account').on(table.departmentId).where(sql`${table.sectorAccount} = true`)]
);

export const equipments = pgTable(
  'equipments',
  {
    id: serial('id').primaryKey(),
    assetTag: text('asset_tag').notNull().unique(),
    serialNumber: text('serial_number').notNull().unique(),
    equipmentType: text('equipment_type').notNull(), // Notebook, Desktop, Impressora, Monitor, Periférico, Rede, Servidor, Outro
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    departmentId: integer('department_id')
      .references(() => departments.id)
      .notNull(),
    parentEquipmentId: integer('parent_equipment_id').references((): AnyPgColumn => equipments.id),
    responsibleCompany: text('responsible_company').notNull(),
    ownershipType: text('ownership_type').notNull(), // Próprio, Alugado, Contratado
    contractNumber: text('contract_number'),
    supplierName: text('supplier_name'),
    contractEndDate: text('contract_end_date'),
    operationalStatus: text('operational_status').notNull().default('Disponível'), // Disponível, Em Uso, Em Manutenção, Baixado/Descartado
    currentHolderName: text('current_holder_name'),
    currentHolderDocument: text('current_holder_document'),
    currentHolderRole: text('current_holder_role'),
    manufactureYear: integer('manufacture_year').notNull(),
    lastInspectionDate: text('last_inspection_date'),
    nextInspectionDate: text('next_inspection_date'),
    accessories: text('accessories'),
    notes: text('notes'),
    connectionInterface: text('connection_interface').notNull().default('N/A'), // Rede (Cabo Ethernet), USB Local, Wi-Fi / Rede, N/A
    networkAddress: text('network_address'),
    portNumber: integer('port_number'),
    connectionStatus: text('connection_status').notNull().default('Não Verificado'), // Conectado, Desconectado, Não Verificado
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_equipments_asset_tag').on(table.assetTag),
    index('idx_equipments_serial_number').on(table.serialNumber),
    index('idx_equipments_department').on(table.departmentId),
    index('idx_equipments_status').on(table.operationalStatus),
  ]
);

export const assetMovements = pgTable(
  'asset_movements',
  {
    id: serial('id').primaryKey(),
    equipmentId: integer('equipment_id')
      .references(() => equipments.id)
      .notNull(),
    movementType: text('movement_type').notNull(), // SAIDA, ENTRADA, TRANSFERENCIA
    previousStatus: text('previous_status').notNull(),
    newStatus: text('new_status').notNull(),
    fromDepartmentId: integer('from_department_id').references(() => departments.id),
    toDepartmentId: integer('to_department_id').references(() => departments.id),
    collaboratorName: text('collaborator_name').notNull(),
    collaboratorDocument: text('collaborator_document').notNull(),
    collaboratorRole: text('collaborator_role').notNull(),
    collaboratorDepartment: text('collaborator_department').notNull(),
    reason: text('reason').notNull(),
    conditionState: text('condition_state').notNull(),
    accessoriesIncluded: text('accessories_included'),
    notes: text('notes'),
    termNumber: text('term_number'),
    performedById: integer('performed_by_id')
      .references(() => users.id)
      .notNull(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_movements_equipment').on(table.equipmentId),
    index('idx_movements_occurred_at').on(table.occurredAt),
  ]
);

export interface InspectionChecklist {
  powerOn: boolean;
  screenOrChassisIntact: boolean;
  portsAndConnectivityOk: boolean;
  peripheralsAndCablesComplete: boolean;
  storageWipedOrVerified: boolean;
  securitySealIntact: boolean;
}

export const inspections = pgTable(
  'inspections',
  {
    id: serial('id').primaryKey(),
    equipmentId: integer('equipment_id')
      .references(() => equipments.id)
      .notNull(),
    movementId: integer('movement_id').references(() => assetMovements.id),
    inspectorId: integer('inspector_id')
      .references(() => users.id)
      .notNull(),
    inspectionDate: text('inspection_date').notNull(),
    nextInspectionDate: text('next_inspection_date'),
    physicalCondition: text('physical_condition').notNull(),
    checklistJson: jsonb('checklist_json').$type<InspectionChecklist>().notNull(),
    findings: text('findings'),
    approvedForUse: boolean('approved_for_use').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_inspections_equipment').on(table.equipmentId)]
);

export const incidents = pgTable(
  'incidents',
  {
    id: serial('id').primaryKey(),
    ticketCode: text('ticket_code').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: text('priority').notNull().default('Média'), // Baixa, Média, Alta, Crítica
    status: text('status').notNull().default('Aberto'), // Aberto, Em Atendimento, Resolvido
    departmentId: integer('department_id')
      .references(() => departments.id)
      .notNull(),
    requesterId: integer('requester_id')
      .references(() => users.id)
      .notNull(),
    assignedTechnicianId: integer('assigned_technician_id').references(() => users.id),
    equipmentId: integer('equipment_id').references(() => equipments.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    index('idx_incidents_department').on(table.departmentId),
    index('idx_incidents_status').on(table.status),
  ]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    departmentId: integer('department_id')
      .references(() => departments.id)
      .notNull(),
    incidentId: integer('incident_id').references(() => incidents.id),
    senderId: integer('sender_id')
      .references(() => users.id)
      .notNull(),
    messageType: text('message_type').notNull().default('CHAT'), // CHAT, INCIDENT_ALERT, STATUS_CHANGE
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_chat_department').on(table.departmentId),
    index('idx_chat_created_at').on(table.createdAt),
  ]
);

export const remoteSessions = pgTable(
  'remote_sessions',
  {
    id: serial('id').primaryKey(),
    equipmentId: integer('equipment_id')
      .references(() => equipments.id)
      .notNull(),
    technicianId: integer('technician_id')
      .references(() => users.id)
      .notNull(),
    actionType: text('action_type').notNull(), // DIAGNOSTICO_REMOTO | IMPRESSAO_TESTE | VERIFICACAO_USB
    connectionInterface: text('connection_interface').notNull(),
    targetAddress: text('target_address'),
    resultStatus: text('result_status').notNull(), // Sucesso | Alerta | Indisponível
    details: text('details').notNull(),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('idx_remote_sessions_equipment').on(table.equipmentId)]
);

// Relations
export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  equipments: many(equipments),
  incidents: many(incidents),
  chatMessages: many(chatMessages),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),
  movementsPerformed: many(assetMovements),
  inspectionsPerformed: many(inspections),
  incidentsRequested: many(incidents),
  messagesSent: many(chatMessages),
}));

export const equipmentsRelations = relations(equipments, ({ one, many }) => ({
  department: one(departments, {
    fields: [equipments.departmentId],
    references: [departments.id],
  }),
  createdBy: one(users, {
    fields: [equipments.createdById],
    references: [users.id],
  }),
  movements: many(assetMovements),
  inspections: many(inspections),
  incidents: many(incidents),
}));

export const assetMovementsRelations = relations(assetMovements, ({ one }) => ({
  equipment: one(equipments, {
    fields: [assetMovements.equipmentId],
    references: [equipments.id],
  }),
  fromDepartment: one(departments, {
    fields: [assetMovements.fromDepartmentId],
    references: [departments.id],
  }),
  toDepartment: one(departments, {
    fields: [assetMovements.toDepartmentId],
    references: [departments.id],
  }),
  performedBy: one(users, {
    fields: [assetMovements.performedById],
    references: [users.id],
  }),
}));

export const inspectionsRelations = relations(inspections, ({ one }) => ({
  equipment: one(equipments, {
    fields: [inspections.equipmentId],
    references: [equipments.id],
  }),
  movement: one(assetMovements, {
    fields: [inspections.movementId],
    references: [assetMovements.id],
  }),
  inspector: one(users, {
    fields: [inspections.inspectorId],
    references: [users.id],
  }),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  department: one(departments, {
    fields: [incidents.departmentId],
    references: [departments.id],
  }),
  requester: one(users, {
    fields: [incidents.requesterId],
    references: [users.id],
  }),
  assignedTechnician: one(users, {
    fields: [incidents.assignedTechnicianId],
    references: [users.id],
  }),
  equipment: one(equipments, {
    fields: [incidents.equipmentId],
    references: [equipments.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  department: one(departments, {
    fields: [chatMessages.departmentId],
    references: [departments.id],
  }),
  incident: one(incidents, {
    fields: [chatMessages.incidentId],
    references: [incidents.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));
