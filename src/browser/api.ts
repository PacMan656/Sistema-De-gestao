import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { departments, users } from '../db/schema.ts';
import { createAccount, findSectorAccount, setAccountActive, setAccountPassword } from '../db/accounts.ts';
import { listSectorDepartments, saveDepartment } from '../db/sectors.ts';
import { saveInventoryEquipment } from '../db/inventory.ts';
import * as queries from '../db/queries.ts';
import { checkinMovementSchema, checkoutMovementSchema, createDepartmentSchema, departmentSchema, equipmentFormSchema, loginSchema, passwordSchema, createIncidentSchema } from '../shared/validation.ts';
import { verifyPassword } from '../server/services/passwordService.ts';
import type { AppUserContext } from '../server/middleware/auth.ts';
import { exportBackup, importBackup } from './backup.ts';

export interface LocalSessionStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
type LocalSession = { token: string; userId: number; version: number; expires: number };
class LocalError extends Error { constructor(message: string, public status = 400) { super(message); } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const pdfResponse = (bytes: Uint8Array) => new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf' } });

// This adapter is local application logic, not a server security boundary.
export function createLocalApi(storage: LocalSessionStore, sessionKey = 'patriti-local-session', publish: (name: string, data: unknown) => void = () => {}) {
  const readSession = (): LocalSession | null => {
    try { return JSON.parse(storage.getItem(sessionKey) || 'null'); } catch { return null; }
  };
  async function authenticate(token?: string) {
    const session = readSession();
    if (!session || session.token !== token || session.expires <= Date.now()) throw new LocalError('Sessão local expirada. Entre novamente.', 401);
    const user = await queries.getUserWithDepartment(session.userId);
    if (!user?.active || !user.sectorAccount || session.version !== user.authVersion) throw new LocalError('Acesso local revogado. Entre novamente.', 401);
    return user;
  }
  function issue(user: AppUserContext) {
    const token = crypto.randomUUID();
    storage.setItem(sessionKey, JSON.stringify({ token, userId: user.id, version: user.authVersion, expires: Date.now() + 12 * 60 * 60 * 1000 }));
    return json({ user, rbacToken: token });
  }
  const admin = (user: AppUserContext) => { if (user.role !== 'admin_ti') throw new LocalError('Operação restrita ao TI.', 403); };
  const scopedDepartment = (user: AppUserContext, requested?: number) => user.role === 'admin_ti' ? requested : user.departmentId ?? -1;
  async function accountForDepartment(id: number) {
    const [account] = await db.select().from(users).where(and(eq(users.departmentId, id), eq(users.sectorAccount, true)));
    return account;
  }
  const emit = (name: string, data: unknown) => publish(name, JSON.parse(JSON.stringify(data)));

  async function handle(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      const parsedUrl = new URL(url, 'https://patriti.local');
      const route = parsedUrl.pathname.replace(/^\/api/, '');
      const method = (options.method || 'GET').toUpperCase();
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
      if (route === '/auth/setup' && method === 'GET') return json({ required: (await db.select({ id: users.id }).from(users).limit(1)).length === 0 });
      if (route === '/auth/setup' && method === 'POST') {
        passwordSchema.parse(body.password);
        const [ti] = await db.select().from(departments).where(eq(departments.code, 'TI'));
        const id = await createAccount({ email: 'sector-ti@patriti.local', fullName: ti.name, matricula: 'TI', jobTitle: 'Administração local', role: 'admin_ti', departmentId: ti.id, password: body.password }, true);
        return issue((await queries.getUserWithDepartment(id))!);
      }
      if (route === '/auth/login' && method === 'POST') {
        const input = loginSchema.parse(body);
        const account = await findSectorAccount(input.sector);
        if (!account?.active || !account.passwordHash || !await verifyPassword(input.password, account.passwordHash)) throw new LocalError('Setor ou senha inválidos, ou acesso desativado.', 401);
        return issue((await queries.getUserWithDepartment(account.id))!);
      }
      const token = new Headers(options.headers).get('Authorization')?.replace(/^Bearer /, '') || (route === '/auth/session' ? readSession()?.token : undefined);
      const user = await authenticate(token);
      if (route === '/auth/session' || route === '/auth/me') return json({ user, rbacToken: token });
      if (route === '/auth/logout' && method === 'POST') { storage.removeItem(sessionKey); return json({ ok: true }); }
      if (route === '/auth/password' && method === 'POST') {
        admin(user); passwordSchema.parse(body.password);
        const [account] = await db.select().from(users).where(eq(users.id, user.id));
        if (!account.passwordHash || !await verifyPassword(body.currentPassword || '', account.passwordHash)) throw new LocalError('Senha atual incorreta.');
        await setAccountPassword(user.id, body.password); return issue((await queries.getUserWithDepartment(user.id))!);
      }
      if (route === '/local/backup') {
        admin(user);
        if (method === 'GET') return json(await exportBackup());
        if (method === 'POST') { await importBackup(body); storage.removeItem(sessionKey); return json({ ok: true }); }
      }
      if (route === '/departments' && method === 'GET') return json(await listSectorDepartments(scopedDepartment(user)));
      if (route === '/departments' && method === 'POST') { admin(user); const input = createDepartmentSchema.parse(body); return json(await saveDepartment(input, undefined, input.password), 201); }
      const departmentMatch = route.match(/^\/departments\/(\d+)(\/access)?$/);
      if (departmentMatch) {
        admin(user); const id = Number(departmentMatch[1]);
        const [department] = await db.select().from(departments).where(eq(departments.id, id));
        if (!department) throw new LocalError('Setor não encontrado.', 404);
        if (!departmentMatch[2] && method === 'PUT') return json(await saveDepartment(departmentSchema.parse(body), id));
        if (id === user.departmentId) throw new LocalError('Use a opção de alterar senha do TI.');
        if (method === 'PUT') { passwordSchema.parse(body.password); await saveDepartment({ ...department, costCenter: department.costCenter || '' }, id, body.password); return json({ ok: true }); }
        if (method === 'PATCH') {
          if (typeof body.active !== 'boolean') throw new LocalError('Informe um estado de acesso válido.');
          const account = await accountForDepartment(id);
          if (!account) throw new LocalError('Defina uma senha para o setor.');
          await setAccountActive(account.id, body.active); return json({ ok: true });
        }
      }
      const query = parsedUrl.searchParams;
      const filter = { search: query.get('search') || undefined, status: query.get('status') || undefined, equipmentType: query.get('equipmentType') || undefined, ownershipType: query.get('ownershipType') || undefined, departmentId: scopedDepartment(user, Number(query.get('departmentId')) || undefined) };
      if (route === '/equipments' && method === 'GET') return json(await queries.listEquipments(filter));
      if (route === '/equipments' && method === 'POST') { admin(user); return json(await saveInventoryEquipment(equipmentFormSchema.parse(body), user.id), 201); }
      if (route === '/equipments/export') {
        admin(user); const rows = await queries.listEquipments(filter);
        if (query.get('format') === 'pdf') return pdfResponse(await (await import('../shared/pdf.ts')).buildInventoryReportPdf(rows, 'Inventário local do navegador'));
        const columns = ['assetTag', 'serialNumber', 'equipmentType', 'brand', 'model', 'departmentCode', 'operationalStatus'] as const;
        const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
        const csv = '\uFEFF' + [columns.map(cell).join(';'), ...rows.map((row) => columns.map((column) => cell(row[column])).join(';'))].join('\r\n');
        return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
      }
      if (route.startsWith('/equipments/by-barcode/')) {
        const found = await queries.findEquipmentByBarcode(decodeURIComponent(route.split('/').pop()!));
        if (!found || (user.role !== 'admin_ti' && found.departmentId !== user.departmentId)) throw new LocalError('Equipamento não encontrado.', 404);
        return json(found);
      }
      const equipmentMatch = route.match(/^\/equipments\/(\d+)(?:\/([a-z-]+))?$/);
      if (equipmentMatch) {
        const id = Number(equipmentMatch[1]); const action = equipmentMatch[2];
        const detail = await queries.getEquipmentDetail(id);
        if (!detail || (user.role !== 'admin_ti' && detail.equipment.departmentId !== user.departmentId)) throw new LocalError('Equipamento não encontrado.', 404);
        if (!action && method === 'GET') return json(user.role === 'admin_ti' ? detail : { ...detail, movements: [], inspections: [] });
        admin(user);
        if (!action && method === 'PUT') return json(await saveInventoryEquipment(equipmentFormSchema.parse(body), user.id, id));
        if (action === 'incidents') return json(await queries.listEquipmentIncidents(id));
        if (action === 'remote-sessions') return json(await queries.listRemoteSessions(id));
        if (action === 'barcode-label-pdf') return pdfResponse(await (await import('../shared/pdf.ts')).buildBarcodeLabelPdf(detail.equipment));
        if (action === 'test-page-pdf') return pdfResponse(await (await import('../shared/pdf.ts')).buildPrinterTestPagePdf(detail.equipment, user.fullName));
        if (action === 'print-test-page') return json({ rawSent: false, message: 'Modo local: use o PDF para imprimir pelo navegador. Envio direto por rede precisa de servidor.', sessions: [] });
        if (action === 'remote-diagnose') throw new LocalError('Diagnóstico TCP e acesso remoto por rede não estão disponíveis no GitHub Pages. Use os recursos locais do dispositivo.', 501);
      }
      if (route === '/movements' && method === 'GET') { admin(user); return json(await queries.listMovements(1000)); }
      if (route === '/movements/checkout' && method === 'POST') { admin(user); return json(await queries.registerCheckoutMovement(checkoutMovementSchema.parse(body), user.id), 201); }
      if (route === '/movements/checkin' && method === 'POST') { admin(user); return json(await queries.registerCheckinMovement(checkinMovementSchema.parse(body), user.id), 201); }
      const termMatch = route.match(/^\/movements\/(\d+)\/term-pdf$/);
      if (termMatch) {
        admin(user); const record = await queries.getMovementForTermPdf(Number(termMatch[1]));
        if (!record || record.movement.movementType !== 'SAIDA') throw new LocalError('Termo não encontrado.', 404);
        return pdfResponse(await (await import('../shared/pdf.ts')).buildResponsibilityTermPdf(record));
      }
      if (route === '/incidents/sector-assets') return json(await queries.listEquipments({ departmentId: scopedDepartment(user) }));
      if (route === '/incidents' && method === 'GET') return json(await queries.listIncidents(scopedDepartment(user, Number(query.get('departmentId')) || undefined)));
      if (route === '/incidents' && method === 'POST') {
        const input = createIncidentSchema.parse(body); const departmentId = scopedDepartment(user, input.departmentId) || user.departmentId;
        if (!departmentId) throw new LocalError('Selecione um setor.');
        const incident = await queries.createIncident(input, user.id, departmentId);
        emit('incident:notify_ti', incident); return json(incident, 201);
      }
      const incidentMatch = route.match(/^\/incidents\/(\d+)\/status$/);
      if (incidentMatch && method === 'PATCH') {
        admin(user); if (!['Aberto', 'Em Atendimento', 'Resolvido'].includes(body.status)) throw new LocalError('Status inválido.');
        const incident = await queries.updateIncidentStatus(Number(incidentMatch[1]), body.status, user.id);
        emit('incident:status_update', incident); return json(incident);
      }
      const chatMatch = route.match(/^\/chat\/(\d+)$/);
      if (chatMatch) {
        const departmentId = Number(chatMatch[1]);
        if (user.role !== 'admin_ti' && user.departmentId !== departmentId) throw new LocalError('Acesso restrito ao seu setor.', 403);
        if (method === 'GET') return json(await queries.listChatMessages(departmentId));
        if (method === 'POST') {
          if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 4000) throw new LocalError('Informe uma mensagem de até 4000 caracteres.');
          const message = await queries.createChatMessage({ departmentId, senderId: user.id, content: body.content.trim(), incidentId: null, messageType: 'CHAT' });
          emit('chat:message', message); return json(message, 201);
        }
      }
      throw new LocalError('Operação não encontrada no modo local.', 404);
    } catch (error) {
      if (error instanceof LocalError) return json({ error: error.message }, error.status);
      const validation = error as { issues?: { message: string }[]; cause?: { code?: string } };
      if (validation.issues) return json({ error: validation.issues[0]?.message || 'Dados inválidos.' }, 400);
      if (validation.cause?.code === '23505') return json({ error: 'Registro já cadastrado.' }, 409);
      return json({ error: error instanceof Error ? error.message : 'Falha ao processar os dados locais.' }, 400);
    }
  }
  return handle;
}
