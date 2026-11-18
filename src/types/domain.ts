import type { InspectionChecklist } from '../db/schema.ts';
import type { UserRole } from '../shared/validation.ts';

export interface Department {
  id: number;
  name: string;
  code: string;
  location: string;
  costCenter: string | null;
  accessConfigured?: boolean;
  accessActive?: boolean;
  accountId?: number | null;
  equipmentCount?: number;
}

export interface AppUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  matricula: string | null;
  jobTitle: string | null;
  role: UserRole;
  departmentId: number | null;
  onboardingCompleted: boolean;
  active: boolean;
  departmentName: string | null;
  departmentCode: string | null;
  departmentLocation: string | null;
}

export interface EquipmentItem {
  id: number;
  assetTag: string;
  serialNumber: string;
  equipmentType: string;
  brand: string;
  model: string;
  departmentId: number;
  departmentName: string | null;
  departmentCode: string | null;
  departmentLocation?: string | null;
  parentEquipmentId?: number | null;
  linkedEquipmentIds?: number[];
  responsibleCompany: string;
  ownershipType: 'Próprio' | 'Alugado' | 'Contratado';
  contractNumber: string | null;
  supplierName: string | null;
  contractEndDate: string | null;
  operationalStatus: 'Disponível' | 'Em Uso' | 'Em Manutenção' | 'Baixado/Descartado';
  currentHolderName: string | null;
  currentHolderDocument: string | null;
  currentHolderRole: string | null;
  manufactureYear: number;
  lastInspectionDate: string | null;
  nextInspectionDate: string | null;
  accessories: string | null;
  notes: string | null;
  connectionInterface: 'Rede (Cabo Ethernet)' | 'USB Local' | 'Wi-Fi / Rede' | 'N/A';
  networkAddress: string | null;
  portNumber: number | null;
  connectionStatus: 'Conectado' | 'Desconectado' | 'Não Verificado';
  createdAt: string;
  updatedAt: string;
}

export interface RemoteSessionRecord {
  id: number;
  equipmentId: number;
  actionType: string;
  connectionInterface: string;
  targetAddress: string | null;
  resultStatus: string;
  details: string;
  latencyMs: number | null;
  createdAt: string;
  technicianName: string | null;
}

export interface MovementRecord {
  id: number;
  equipmentId: number;
  assetTag?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  movementType: 'SAIDA' | 'ENTRADA' | 'TRANSFERENCIA';
  previousStatus: string;
  newStatus: string;
  fromDepartmentId?: number | null;
  toDepartmentId?: number | null;
  collaboratorName: string;
  collaboratorDocument: string;
  collaboratorRole: string;
  collaboratorDepartment: string;
  reason: string;
  conditionState: string;
  accessoriesIncluded?: string | null;
  notes?: string | null;
  termNumber: string | null;
  performedByName: string | null;
  occurredAt: string;
}

export interface InspectionRecord {
  id: number;
  equipmentId: number;
  movementId: number | null;
  inspectionDate: string;
  nextInspectionDate: string | null;
  physicalCondition: string;
  checklistJson: InspectionChecklist;
  findings: string | null;
  approvedForUse: boolean;
  inspectorName: string | null;
  createdAt: string;
}

export interface IncidentItem {
  id: number;
  ticketCode: string;
  title: string;
  description: string;
  priority: 'Baixa' | 'Média' | 'Alta' | 'Crítica';
  status: 'Aberto' | 'Em Atendimento' | 'Resolvido';
  departmentId: number;
  departmentName: string;
  departmentCode: string;
  departmentLocation: string;
  requesterId: number;
  requesterName: string;
  requesterEmail: string;
  assignedTechnicianId: number | null;
  equipmentId: number | null;
  equipmentAssetTag: string | null;
  equipmentModel: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ChatMessageItem {
  id: number;
  departmentId: number;
  departmentName: string;
  departmentCode: string;
  incidentId: number | null;
  senderId: number;
  senderName: string;
  senderRole: UserRole;
  messageType: 'CHAT' | 'INCIDENT_ALERT' | 'STATUS_CHANGE';
  content: string;
  createdAt: string;
}

export interface PresenceUser {
  id: number;
  fullName: string;
  role: string;
  departmentCode: string | null;
}
