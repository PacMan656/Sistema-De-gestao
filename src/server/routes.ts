import { Router } from 'express';
import { accountRouter, sendSession } from './accountRoutes.ts';
import { sectorRouter } from './sectorRoutes.ts';
import { listSectorDepartments } from '../db/sectors.ts';
import { saveInventoryEquipment, InventoryValidationError } from '../db/inventory.ts';
import { disconnectUserSockets } from './socket.ts';
import type { Response } from 'express';
import {
  completeUserOnboarding,
  createRemoteSessionLog,
  findEquipmentByBarcode,
  getEquipmentDetail,
  getMovementForTermPdf,
  getUserWithDepartment,
  listChatMessages,
  listEquipmentIncidents,
  listEquipments,
  listIncidents,
  listMovements,
  listRemoteSessions,
  listUsers,
  registerCheckinMovement,
  registerCheckoutMovement,
  updateEquipmentConnectionStatus,
  updateUserRoleAndDepartment,
} from '../db/queries.ts';
import {
  checkinMovementSchema,
  checkoutMovementSchema,
  equipmentFormSchema,
  onboardingSchema,
  USER_ROLES,
} from '../shared/validation.ts';
import {
  requireAdminTI,
  requireAuth,
  signRbacJwt,
} from './middleware/auth.ts';
import type { AuthRequest } from './middleware/auth.ts';
import {
  buildBarcodeLabelPdf,
  buildInventoryReportPdf,
  buildPrinterTestPagePdf,
  buildResponsibilityTermPdf,
} from './services/pdfService.ts';
import {
  buildRawPrinterTestPayload,
  probeTcpPort,
  sendRawTcpPrintJob,
} from './services/remoteService.ts';

export const apiRouter = Router();
apiRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
apiRouter.use(accountRouter);
apiRouter.use(sectorRouter);

apiRouter.get('/health', (_req, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

apiRouter.get('/departments', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const items = await listSectorDepartments(req.appUser!.role === 'admin_ti' ? undefined : req.appUser!.departmentId ?? -1);
    res.json(items);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao listar setores.',
    });
  }
});

apiRouter.get('/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const rbacToken = signRbacJwt(user);
    res.json({ user, rbacToken });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao carregar perfil.',
    });
  }
});

apiRouter.post('/auth/session-jwt', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = req.appUser!;
  return sendSession(res, user);
});

apiRouter.post('/auth/onboarding', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.appUser!.onboardingCompleted || Number(req.body?.departmentId) !== req.appUser!.departmentId) {
    return res.status(403).json({ error: 'Seu cadastro e departamento são gerenciados pelo TI.' });
  }
  if (req.body?.role && req.body.role !== req.appUser!.role) {
    return res.status(403).json({ error: 'Somente o TI pode alterar seu perfil de acesso.' });
  }
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Dados de perfil inválidos.',
    });
  }

  try {
    await completeUserOnboarding(req.appUser!.id, parsed.data);
    const updatedUser = await getUserWithDepartment(req.appUser!.id);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const rbacToken = signRbacJwt(updatedUser);
    return res.json({ user: updatedUser, rbacToken });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao salvar perfil.',
    });
  }
});

// Admin user & department role management
apiRouter.get('/users', requireAuth, requireAdminTI, async (_req: AuthRequest, res: Response) => {
  try {
    const items = await listUsers();
    res.json(items);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao listar usuários.',
    });
  }
});

apiRouter.patch(
  '/users/:id/role',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const userId = Number(req.params.id);
    const role = req.body?.role;
    const departmentId = Number(req.body?.departmentId);

    if (userId === req.appUser!.id && role !== req.appUser!.role) {
      return res.status(400).json({ error: 'Solicite a outro administrador a alteração do seu perfil.' });
    }

    if (
      !userId ||
      !USER_ROLES.includes(role) ||
      !departmentId
    ) {
      return res.status(400).json({ error: 'Parâmetros de permissão inválidos.' });
    }

    try {
      const account = await getUserWithDepartment(userId);
      if (account?.sectorAccount) return res.status(400).json({ error: 'O perfil e o vínculo do setor são fixos. Gerencie o acesso em Setores e Acessos.' });
      const updated = await updateUserRoleAndDepartment(userId, role, departmentId);
      if (!updated) {
        return res.status(404).json({ error: 'Usuário não encontrado.' });
      }
      if (userId !== req.appUser!.id) disconnectUserSockets(userId);
      return res.json(await getUserWithDepartment(userId));
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao atualizar permissões.',
      });
    }
  }
);

// Equipments CRUD & Export (TI Only)
apiRouter.get(
  '/equipments',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const requestedDeptId = req.query.departmentId
        ? Number(req.query.departmentId)
        : undefined;

      const items = await listEquipments({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        ownershipType:
          typeof req.query.ownershipType === 'string'
            ? req.query.ownershipType
            : undefined,
        equipmentType:
          typeof req.query.equipmentType === 'string'
            ? req.query.equipmentType
            : undefined,
        departmentId: req.appUser!.role === 'admin_ti' ? requestedDeptId : req.appUser!.departmentId ?? -1,
      });
      res.json(items);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao listar equipamentos.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/export',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const ownershipType =
      typeof req.query.ownershipType === 'string' ? req.query.ownershipType : undefined;
    const equipmentType =
      typeof req.query.equipmentType === 'string' ? req.query.equipmentType : undefined;
    const departmentId = req.query.departmentId
      ? Number(req.query.departmentId)
      : undefined;

    try {
      const items = await listEquipments({
        search,
        status,
        ownershipType,
        equipmentType,
        departmentId,
      });

      const dateStamp = new Date().toISOString().slice(0, 10);

      if (format === 'pdf') {
        const activeFilters = [
          status && status !== 'Todos' ? `Status=${status}` : null,
          ownershipType && ownershipType !== 'Todos'
            ? `Propriedade=${ownershipType}`
            : null,
          equipmentType && equipmentType !== 'Todos'
            ? `Tipo=${equipmentType}`
            : null,
          search ? `Busca="${search}"` : null,
        ]
          .filter(Boolean)
          .join(', ');

        const pdfBuffer = await buildInventoryReportPdf(
          items,
          activeFilters || 'Todos os ativos'
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="inventario-ti-${dateStamp}.pdf"`
        );
        return res.send(pdfBuffer);
      }

      const escapeCsv = (val: string | number | null | undefined) => {
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers = [
        'Patrimônio',
        'Número de Série',
        'Tipo',
        'Marca',
        'Modelo',
        'Setor',
        'Código Setor',
        'Empresa Responsável',
        'Propriedade',
        'Contrato',
        'Fornecedor',
        'Vigência Contrato',
        'Status Operacional',
        'Portador Atual',
        'Documento Portador',
        'Ano Fabricação',
        'Última Vistoria',
        'Próxima Vistoria',
        'Acessórios',
        'Observações',
      ];

      const lines = [
        headers.map(escapeCsv).join(';'),
        ...items.map((item) =>
          [
            item.assetTag,
            item.serialNumber,
            item.equipmentType,
            item.brand,
            item.model,
            item.departmentName,
            item.departmentCode,
            item.responsibleCompany,
            item.ownershipType,
            item.contractNumber,
            item.supplierName,
            item.contractEndDate,
            item.operationalStatus,
            item.currentHolderName,
            item.currentHolderDocument,
            item.manufactureYear,
            item.lastInspectionDate,
            item.nextInspectionDate,
            item.accessories,
            item.notes,
          ]
            .map(escapeCsv)
            .join(';')
        ),
      ];

      const csvContent = `\uFEFF${lines.join('\r\n')}`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventario-ti-${dateStamp}.csv"`
      );
      return res.send(csvContent);
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao exportar inventário.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/by-barcode/:code',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const code = String(req.params.code || '').trim();
    if (!code) {
      return res.status(400).json({ error: 'Código de barras não informado.' });
    }
    try {
      const found = await findEquipmentByBarcode(code);
      if (!found || (req.appUser!.role !== 'admin_ti' && found.departmentId !== req.appUser!.departmentId)) {
        return res.status(404).json({
          error: `Nenhum ativo encontrado para o código "${code.toUpperCase()}".`,
        });
      }
      return res.json(found);
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Erro ao consultar código.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/:id',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const detail = await getEquipmentDetail(id);
      if (!detail || (req.appUser!.role !== 'admin_ti' && detail.equipment.departmentId !== req.appUser!.departmentId)) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      return res.json(req.appUser!.role === 'admin_ti' ? detail : { ...detail, movements: [], inspections: [] });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao carregar detalhes.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/:id/barcode-label-pdf',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const detail = await getEquipmentDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      const pdfBuffer = await buildBarcodeLabelPdf(detail.equipment);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="etiqueta-${detail.equipment.assetTag}.pdf"`
      );
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao gerar etiqueta com código de barras.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/:id/test-page-pdf',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const detail = await getEquipmentDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      const pdfBuffer = await buildPrinterTestPagePdf(
        detail.equipment,
        req.appUser!.fullName
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="pagina-teste-${detail.equipment.assetTag}.pdf"`
      );
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao gerar página de teste PDF.',
      });
    }
  }
);

apiRouter.get(
  '/equipments/:id/remote-sessions',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const sessions = await listRemoteSessions(id, 15);
      return res.json(sessions);
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao consultar logs remotos.',
      });
    }
  }
);

apiRouter.post(
  '/equipments/:id/remote-diagnose',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const detail = await getEquipmentDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      const eq = detail.equipment;
      const openIncidents = await listEquipmentIncidents(id);
      const activeIncidents = openIncidents.filter((i) => i.status !== 'Resolvido');

      const probes = [];
      let anyReachable = false;
      let fastestLatency: number | null = null;

      const isNetworkInterface =
        eq.connectionInterface === 'Rede (Cabo Ethernet)' ||
        eq.connectionInterface === 'Wi-Fi / Rede';

      if (isNetworkInterface && eq.networkAddress) {
        const portsToCheck =
          eq.equipmentType === 'Impressora'
            ? [
                { port: eq.portNumber || 9100, service: 'RAW JetDirect' },
                { port: 631, service: 'IPP Print' },
                { port: 80, service: 'HTTP Admin' },
              ]
            : [
                { port: eq.portNumber || 22, service: 'SSH / Remoto' },
                { port: 3389, service: 'RDP Área Remota' },
                { port: 445, service: 'SMB / Rede' },
              ];

        for (const p of portsToCheck) {
          const result = await probeTcpPort(eq.networkAddress, p.port, p.service, 1200);
          probes.push(result);
          if (result.reachable) {
            anyReachable = true;
            if (
              result.latencyMs !== null &&
              (fastestLatency === null || result.latencyMs < fastestLatency)
            ) {
              fastestLatency = result.latencyMs;
            }
          }
        }
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const inspectionOverdue = Boolean(
        eq.nextInspectionDate && eq.nextInspectionDate < todayIso
      );
      const contractExpired = Boolean(
        eq.contractEndDate && eq.contractEndDate < todayIso
      );

      const issuesFound: string[] = [];
      if (eq.operationalStatus === 'Em Manutenção') {
        issuesFound.push('Ativo marcado como "Em Manutenção" no inventário.');
      }
      if (eq.operationalStatus === 'Baixado/Descartado') {
        issuesFound.push('Ativo baixado/descartado.');
      }
      if (inspectionOverdue) {
        issuesFound.push(`Vistoria prevista vencida em ${eq.nextInspectionDate}.`);
      }
      if (contractExpired) {
        issuesFound.push(`Contrato vencido em ${eq.contractEndDate}.`);
      }
      if (activeIncidents.length > 0) {
        issuesFound.push(
          `${activeIncidents.length} chamado(s) aberto(s)/em atendimento para este patrimônio.`
        );
      }
      if (isNetworkInterface && eq.networkAddress && !anyReachable) {
        issuesFound.push(
          `Nenhuma porta TCP respondeu em ${eq.networkAddress} a partir do servidor (verifique cabo de rede, energia ou rede local do setor).`
        );
      }
      if (eq.connectionInterface === 'USB Local') {
        issuesFound.push(
          'Conexão via Cabo USB Local: diagnóstico físico de porta USB deve ser executado na estação do setor ou via WebUSB no navegador.'
        );
      }
      if (eq.connectionInterface === 'N/A') {
        issuesFound.push(
          'Equipamento sem interface de conexão remota cadastrada.'
        );
      }

      const nextConnStatus: 'Conectado' | 'Desconectado' | 'Não Verificado' =
        eq.connectionInterface === 'USB Local'
          ? eq.connectionStatus === 'Conectado' ||
            eq.connectionStatus === 'Desconectado'
            ? eq.connectionStatus
            : 'Não Verificado'
          : isNetworkInterface && eq.networkAddress
            ? anyReachable
              ? 'Conectado'
              : 'Desconectado'
            : 'Não Verificado';

      await updateEquipmentConnectionStatus(id, nextConnStatus);

      const resultStatus: 'Sucesso' | 'Alerta' | 'Indisponível' =
        anyReachable && issuesFound.length === 0
          ? 'Sucesso'
          : issuesFound.length > 0 && (anyReachable || eq.connectionInterface === 'USB Local')
            ? 'Alerta'
            : isNetworkInterface && !anyReachable
              ? 'Indisponível'
              : 'Alerta';

      const summaryDetails =
        issuesFound.length > 0
          ? issuesFound.join(' | ')
          : `Diagnóstico concluído sem falhas (${eq.departmentCode} · ${eq.networkAddress || eq.connectionInterface}).`;

      await createRemoteSessionLog({
        equipmentId: id,
        technicianId: req.appUser!.id,
        actionType: 'DIAGNOSTICO_REMOTO',
        connectionInterface: eq.connectionInterface,
        targetAddress: eq.networkAddress,
        resultStatus,
        details: summaryDetails,
        latencyMs: fastestLatency,
      });

      const sessions = await listRemoteSessions(id, 15);
      return res.json({
        equipmentId: id,
        connectionInterface: eq.connectionInterface,
        networkAddress: eq.networkAddress,
        connectionStatus: nextConnStatus,
        probes,
        issuesFound,
        activeIncidents,
        inspectionOverdue,
        contractExpired,
        sessions,
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao executar diagnóstico remoto.',
      });
    }
  }
);

apiRouter.post(
  '/equipments/:id/print-test-page',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    try {
      const detail = await getEquipmentDetail(id);
      if (!detail) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      const eq = detail.equipment;
      const isNetwork =
        (eq.connectionInterface === 'Rede (Cabo Ethernet)' ||
          eq.connectionInterface === 'Wi-Fi / Rede') &&
        Boolean(eq.networkAddress);

      let rawSent = false;
      let latencyMs: number | null = null;
      let message =
        'Página de teste PDF gerada para impressão direta via navegador ou cabo USB local.';

      if (isNetwork && eq.networkAddress) {
        const targetPort = eq.portNumber || 9100;
        const rawPayload = buildRawPrinterTestPayload({
          assetTag: eq.assetTag,
          serialNumber: eq.serialNumber,
          brand: eq.brand,
          model: eq.model,
          departmentName: `${eq.departmentCode} - ${eq.departmentName}`,
          technicianName: req.appUser!.fullName,
          networkAddress: `${eq.networkAddress}:${targetPort}`,
        });
        const job = await sendRawTcpPrintJob(
          eq.networkAddress,
          targetPort,
          rawPayload,
          2000
        );
        rawSent = job.sent;
        latencyMs = job.latencyMs;
        message = job.message;
      }

      await createRemoteSessionLog({
        equipmentId: id,
        technicianId: req.appUser!.id,
        actionType: 'IMPRESSAO_TESTE',
        connectionInterface: eq.connectionInterface,
        targetAddress: eq.networkAddress,
        resultStatus: rawSent ? 'Sucesso' : 'Alerta',
        details: message,
        latencyMs,
      });

      const sessions = await listRemoteSessions(id, 15);
      return res.json({
        rawSent,
        message,
        latencyMs,
        sessions,
      });
    } catch (error) {
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao processar impressão de teste.',
      });
    }
  }
);


apiRouter.post(
  '/equipments',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const parsed = equipmentFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dados de equipamento inválidos.',
        issues: parsed.error.issues,
      });
    }

    try {
      const created = await saveInventoryEquipment(parsed.data, req.appUser!.id);
      return res.status(201).json(created);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao cadastrar ativo.';
      if (error instanceof InventoryValidationError) return res.status(400).json({ error: msg });
      if ((error as { cause?: { code?: string } }).cause?.code === '23505') return res.status(409).json({ error: 'Patrimônio ou número de série já cadastrado.' });
      const status = msg.includes('duplicado') ? 409 : 500;
      return res.status(status).json({ error: msg });
    }
  }
);

apiRouter.put(
  '/equipments/:id',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const parsed = equipmentFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dados de equipamento inválidos.',
        issues: parsed.error.issues,
      });
    }

    try {
      const updated = await saveInventoryEquipment(parsed.data, req.appUser!.id, id);
      if (!updated) {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      return res.json(updated);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao atualizar ativo.';
      if (error instanceof InventoryValidationError) return res.status(400).json({ error: msg });
      if ((error as { cause?: { code?: string } }).cause?.code === '23505') return res.status(409).json({ error: 'Patrimônio ou número de série já cadastrado.' });
      const status = msg.includes('duplicado') ? 409 : 500;
      return res.status(status).json({ error: msg });
    }
  }
);

// Movements (Checkout / Checkin / Audit Log / PDF Term — TI Only)
apiRouter.get(
  '/movements',
  requireAuth,
  requireAdminTI,
  async (_req: AuthRequest, res: Response) => {
    try {
      const items = await listMovements(100);
      return res.json(items);
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao listar movimentações.',
      });
    }
  }
);

apiRouter.post(
  '/movements/checkout',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const parsed = checkoutMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dados de saída inválidos.',
      });
    }

    try {
      const result = await registerCheckoutMovement(parsed.data, req.appUser!.id);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof InventoryValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof Error) {
        if (error.message === 'EQUIPAMENTO_NAO_ENCONTRADO') {
          return res.status(404).json({ error: 'Equipamento não encontrado.' });
        }
        if (error.message === 'EQUIPAMENTO_INDISPONIVEL') {
          return res.status(409).json({
            error: 'Apenas equipamentos com status "Disponível" podem ser entregues.',
          });
        }
      }
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Erro ao registrar saída de ativo.',
      });
    }
  }
);

apiRouter.post(
  '/movements/checkin',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const parsed = checkinMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Dados de devolução inválidos.',
      });
    }

    try {
      const result = await registerCheckinMovement(parsed.data, req.appUser!.id);
      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof InventoryValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof Error && error.message === 'EQUIPAMENTO_NAO_ENCONTRADO') {
        return res.status(404).json({ error: 'Equipamento não encontrado.' });
      }
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Erro ao registrar entrada/devolução.',
      });
    }
  }
);

apiRouter.get(
  '/movements/:id/term-pdf',
  requireAuth,
  requireAdminTI,
  async (req: AuthRequest, res: Response) => {
    const movementId = Number(req.params.id);
    if (!movementId) {
      return res.status(400).json({ error: 'ID de movimentação inválido.' });
    }

    try {
      const record = await getMovementForTermPdf(movementId);
      if (!record) {
        return res.status(404).json({ error: 'Movimentação não encontrada.' });
      }
      if (record.movement.movementType !== 'SAIDA') {
        return res.status(400).json({
          error: 'Termo de responsabilidade disponível apenas para registros de saída.',
        });
      }

      const pdfBuffer = await buildResponsibilityTermPdf(record);
      const filename = `${record.movement.termNumber || `Termo-${record.movement.id}`}-${record.equipment.assetTag}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.send(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);
      return res.status(500).json({ error: 'Erro ao gerar PDF do termo.' });
    }
  }
);

// Minimal asset tag lookup strictly for optional linking when opening a Helpdesk ticket
apiRouter.get(
  '/incidents/sector-assets',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = req.appUser!;
      const deptId =
        user.role === 'admin_ti' ? undefined : user.departmentId ?? -1;
      const items = await listEquipments({ departmentId: deptId });
      res.json(
        items.map((item) => ({
          id: item.id,
          assetTag: item.assetTag,
          brand: item.brand,
          model: item.model,
          departmentCode: item.departmentCode,
        }))
      );
    } catch (error) {
      res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Erro ao buscar patrimônios.',
      });
    }
  }
);

// Helpdesk & Community Chat History
apiRouter.get('/incidents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.appUser!;
    const deptFilter =
      user.role === 'admin_ti'
        ? req.query.departmentId
          ? Number(req.query.departmentId)
          : undefined
        : user.departmentId ?? -1;

    const items = await listIncidents(deptFilter);
    res.json(items);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao carregar chamados.',
    });
  }
});

apiRouter.get(
  '/chat/:departmentId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const departmentId = Number(req.params.departmentId);
    if (!departmentId) {
      return res.status(400).json({ error: 'Setor inválido.' });
    }

    if (
      req.appUser!.role !== 'admin_ti' &&
      req.appUser!.departmentId !== departmentId
    ) {
      return res.status(403).json({
        error: 'Acesso restrito ao canal de comunicação do seu departamento.',
      });
    }

    try {
      const messages = await listChatMessages(departmentId);
      return res.json(messages);
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Erro ao carregar mensagens.',
      });
    }
  }
);
