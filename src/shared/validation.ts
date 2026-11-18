import { z } from 'zod';

export const USER_ROLES = ['admin_ti', 'colaborador'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EQUIPMENT_TYPES = [
  'Notebook',
  'Desktop',
  'Impressora',
  'Monitor',
  'Periférico',
  'Rede',
  'Servidor',
  'Outro',
] as const;

export const OWNERSHIP_TYPES = ['Próprio', 'Alugado', 'Contratado'] as const;

export const OPERATIONAL_STATUSES = [
  'Disponível',
  'Em Uso',
  'Em Manutenção',
  'Baixado/Descartado',
] as const;

export const CONDITION_STATES = [
  'Excelente',
  'Bom',
  'Regular',
  'Com Avarias',
] as const;

export const INCIDENT_PRIORITIES = ['Baixa', 'Média', 'Alta', 'Crítica'] as const;

export const INCIDENT_STATUSES = ['Aberto', 'Em Atendimento', 'Resolvido'] as const;

export const CONNECTION_INTERFACES = [
  'Rede (Cabo Ethernet)',
  'USB Local',
  'Wi-Fi / Rede',
  'N/A',
] as const;

export const CONNECTION_STATUSES = [
  'Conectado',
  'Desconectado',
  'Não Verificado',
] as const;

export const onboardingSchema = z.object({
  fullName: z.string().min(3, 'Informe o nome completo (mínimo 3 caracteres).'),
  matricula: z.string().min(2, 'Informe a matrícula ou CPF funcional.'),
  jobTitle: z.string().min(2, 'Informe o cargo atual.'),
  departmentId: z.number().int().positive('Selecione um setor/departamento.'),
  role: z.enum(USER_ROLES),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const passwordSchema = z.string().min(12, 'Use uma senha com pelo menos 12 caracteres.').max(128, 'Use no máximo 128 caracteres.');
export const loginSchema = z.object({
  sector: z.string().trim().toUpperCase().min(2, 'Informe o código do setor.').max(24),
  password: z.string().min(1, 'Informe a senha.').max(128),
});
export const createUserSchema = onboardingSchema.extend({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254),
  password: passwordSchema,
  fullName: z.string().trim().min(3, 'Informe o nome completo.').max(160),
  matricula: z.string().trim().min(2, 'Informe a matrícula.').max(80),
  jobTitle: z.string().trim().min(2, 'Informe o cargo.').max(120),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const departmentSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome do setor.').max(120),
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9_-]+$/, 'Use letras, números, hífen ou sublinhado no código.'),
  location: z.string().trim().min(2, 'Informe a localização.').max(160),
  costCenter: z.string().trim().max(80).optional().default(''),
});
export const createDepartmentSchema = departmentSchema.extend({ password: passwordSchema });
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const equipmentFormSchema = z
  .object({
    assetTag: z
      .string()
      .trim()
      .min(3, 'Número de patrimônio obrigatório (mín. 3 caracteres).')
      .max(40, 'Máximo de 40 caracteres.'),
    serialNumber: z
      .string()
      .trim()
      .min(3, 'Número de série obrigatório.')
      .max(60, 'Máximo de 60 caracteres.'),
    equipmentType: z.enum(EQUIPMENT_TYPES),
    brand: z.string().trim().min(2, 'Informe a marca do fabricante.'),
    model: z.string().trim().min(2, 'Informe o modelo exato.'),
    departmentId: z.number().int().positive('Selecione o setor atual.'),
    parentEquipmentId: z.number().int().positive().nullable().optional(),
    linkedEquipmentIds: z.array(z.number().int().positive()).max(100).optional(),
    responsibleCompany: z
      .string()
      .trim()
      .min(2, 'Informe a empresa responsável (proprietária ou locadora).'),
    ownershipType: z.enum(OWNERSHIP_TYPES),
    contractNumber: z.string().trim().optional().or(z.literal('')),
    supplierName: z.string().trim().optional().or(z.literal('')),
    contractEndDate: z.string().trim().optional().or(z.literal('')),
    operationalStatus: z.enum(OPERATIONAL_STATUSES),
    manufactureYear: z
      .number()
      .int()
      .min(1995, 'Ano inválido.')
      .max(2030, 'Ano inválido.'),
    lastInspectionDate: z.string().trim().optional().or(z.literal('')),
    nextInspectionDate: z.string().trim().optional().or(z.literal('')),
    accessories: z.string().trim().optional().or(z.literal('')),
    notes: z.string().trim().optional().or(z.literal('')),
    connectionInterface: z.enum(CONNECTION_INTERFACES),
    networkAddress: z.string().trim().optional().or(z.literal('')),
    portNumber: z
      .number()
      .int()
      .min(1, 'Porta inválida.')
      .max(65535, 'Porta inválida.')
      .nullable()
      .optional(),
    connectionStatus: z.enum(CONNECTION_STATUSES),
  })
  .superRefine((data, ctx) => {
    if (data.ownershipType === 'Alugado' || data.ownershipType === 'Contratado') {
      if (!data.contractNumber || data.contractNumber.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contractNumber'],
          message: 'Número do contrato é obrigatório para ativos alugados ou contratados.',
        });
      }
      if (!data.supplierName || data.supplierName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['supplierName'],
          message: 'Fornecedor/Locadora é obrigatório para ativos alugados ou contratados.',
        });
      }
    }
  });

export type EquipmentFormInput = z.infer<typeof equipmentFormSchema>;

export const checkoutMovementSchema = z.object({
  equipmentId: z.number().int().positive(),
  toDepartmentId: z.number().int().positive('Selecione o setor de destino.'),
  collaboratorName: z.string().trim().min(3, 'Nome do colaborador obrigatório.'),
  collaboratorDocument: z.string().trim().min(3, 'CPF ou Matrícula obrigatório.'),
  collaboratorRole: z.string().trim().min(2, 'Cargo obrigatório.'),
  reason: z.string().trim().min(3, 'Descreva o motivo da entrega/alocação.'),
  conditionState: z.enum(CONDITION_STATES),
  accessoriesIncluded: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});

export type CheckoutMovementInput = z.infer<typeof checkoutMovementSchema>;

export const checkinMovementSchema = z.object({
  equipmentId: z.number().int().positive(),
  toDepartmentId: z.number().int().positive('Selecione o setor de estoque/destino.'),
  targetStatus: z.enum(['Disponível', 'Em Manutenção']),
  collaboratorName: z.string().trim().min(2, 'Informe quem está devolvendo/entregando.'),
  collaboratorDocument: z.string().trim().min(2, 'Informe CPF/Matrícula do portador ou lote.'),
  collaboratorRole: z.string().trim().min(2, 'Informe cargo ou origem.'),
  reason: z.string().trim().min(3, 'Informe o motivo da devolução/entrada.'),
  conditionState: z.enum(CONDITION_STATES),
  nextInspectionDate: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
  checklist: z.object({
    powerOn: z.boolean(),
    screenOrChassisIntact: z.boolean(),
    portsAndConnectivityOk: z.boolean(),
    peripheralsAndCablesComplete: z.boolean(),
    storageWipedOrVerified: z.boolean(),
    securitySealIntact: z.boolean(),
  }),
});

export type CheckinMovementInput = z.infer<typeof checkinMovementSchema>;

export const createIncidentSchema = z.object({
  title: z.string().trim().min(4, 'Título deve ter pelo menos 4 caracteres.'),
  description: z.string().trim().min(6, 'Descreva o problema com clareza.'),
  priority: z.enum(INCIDENT_PRIORITIES),
  equipmentId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().optional(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
